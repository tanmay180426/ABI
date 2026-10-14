"""Time real HTTP Insights requests at the normal 20-second provider timeout.

Uses an already installed cloud-disabled Ollama server; never pulls a model.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from contextlib import ExitStack
from concurrent.futures import ThreadPoolExecutor

import httpx

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True)
parser.add_argument('--ollama-url', default='http://localhost:11434')
parser.add_argument('--port', type=int, default=8034)
parser.add_argument('--reference-db', help='Optional read-only reference fixture for a separate larger-context experiment.')
parser.add_argument('--question', default='Say only OK if the supplied context is readable.')
args = parser.parse_args()
results = []

def timed(operation):
    start = time.perf_counter()
    value = operation()
    return value, round(time.perf_counter() - start, 3)

with tempfile.TemporaryDirectory(prefix='sem5-local-ai-readiness-') as directory:
    def scenario(name, model, url, prepare=None):
        if prepare:
            prepare()
        env = dict(os.environ)
        storage = ExitStack()
        if args.reference_db:
            sys.path.insert(0, str(ROOT / 'backend'))
            from tests.database_fixture import test_storage
            database = storage.enter_context(test_storage(args.reference_db))
        else:
            database = Path(directory) / (name + '.db')
        env.update(DATABASE_URL='sqlite:///' + database.as_posix(),
                   ENABLE_LLM_ASSISTANT='true', LLM_PROVIDER='ollama', OLLAMA_BASE_URL=url,
                   OLLAMA_MODEL=model, LLM_TIMEOUT_SECONDS='20', AUTH_ADMIN_PASSWORD='admin123')
        for key in list(env):
            if any(provider in key.upper() for provider in ('OPENAI', 'ANTHROPIC', 'GEMINI', 'OPENROUTER')) and any(secret in key.upper() for secret in ('KEY', 'TOKEN')):
                env.pop(key)
        process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--app-dir', str(ROOT / 'backend'),
            '--host', '127.0.0.1', '--port', str(args.port)], env=env, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            with httpx.Client(base_url=f'http://localhost:{args.port}', timeout=70, trust_env=False) as client:
                for _ in range(100):
                    try:
                        if client.get('/health').status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    if process.poll() is not None:
                        raise RuntimeError('Readiness API failed startup.')
                    time.sleep(0.1)
                login = client.post('/api/auth/login', data={'username': 'admin', 'password': 'admin123'})
                assert login.status_code == 200
                headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
                if args.reference_db:
                    identifier = client.get('/api/datasets', headers=headers).json()['datasets'][0]['dataset_id']
                else:
                    uploaded = client.post('/api/datasets/upload', headers=headers, data={'name': 'Readiness fixture'},
                        files={'file': ('fixture.csv', b'date,revenue\n2025-01-01,200\n2025-01-02,800\n')}).json()
                    identifier = uploaded['dataset_id']
                assert client.post(f'/api/datasets/{identifier}/select', headers=headers).status_code == 200
                expected = client.get('/api/analytics/overview', headers=headers).json()['kpis']['total_revenue']
                numerical, number_seconds = timed(lambda: client.post('/api/insights/query', headers=headers,
                    json={'question': 'What is the total revenue?'}).json())
                assert numerical['provider'] == 'computed' and f'{expected:,.2f}' in numerical['answer']
                generation_start = time.perf_counter()
                with ThreadPoolExecutor(max_workers=1) as pool:
                    pending = pool.submit(lambda: client.post('/api/insights/query', headers=headers,
                        json={'question': args.question}).json())
                    time.sleep(1)
                    in_flight = not pending.done()
                    concurrent, concurrent_seconds = timed(lambda: client.post('/api/insights/query', headers=headers,
                        json={'question': 'What is the total revenue?'}).json())
                    assert concurrent['provider'] == 'computed'
                    generation = pending.result()
                generate_seconds = round(time.perf_counter() - generation_start, 3)
                assert generation['status'] in {'available', 'llm_unavailable'}
                assert generation['dataset_id'] == identifier
                if generation['status'] == 'llm_unavailable':
                    assert 'cannot answer that question' in generation['answer']
                results.append({'scenario': name, 'normal_provider_timeout_seconds': 20,
                    'numerical_seconds': number_seconds, 'numerical_provider': numerical['provider'],
                    'generation_seconds': generate_seconds, 'generation_status': generation['status'],
                    'generation_provider': generation['provider'], 'fallback_truthful': generation['status'] == 'llm_unavailable',
                    'concurrent_numerical_seconds': concurrent_seconds, 'generation_in_flight_at_numerical_start': in_flight})
        finally:
            # Windows venv launchers may own a child interpreter; stop only
            # this spawned server tree before deleting its disposable SQLite DB.
            if os.name == 'nt' and process.poll() is None:
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            elif process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            storage.close()

    scenario('unreachable', args.model, 'http://127.0.0.1:11435')
    scenario('absent-model', 'sem5-readiness-not-installed:local', args.ollama_url)
    with httpx.Client(base_url=args.ollama_url, timeout=180, trust_env=False, follow_redirects=False) as ollama:
        metadata = ollama.post('/api/show', json={'model': args.model})
        metadata.raise_for_status()
        info = metadata.json()
        assert info.get('model_info') and not info.get('remote_model') and not info.get('remote_host')
        def unload():
            response = ollama.post('/api/generate', json={'model': args.model, 'keep_alive': 0, 'stream': False})
            response.raise_for_status()
            assert not any(m['name'] == args.model for m in ollama.get('/api/ps').json().get('models', []))
        scenario('cold-model', args.model, args.ollama_url, unload)
        unload()
        preload, preload_seconds = timed(lambda: ollama.post('/api/generate', json={'model': args.model, 'stream': False}))
        preload.raise_for_status()
        results.append({'scenario': 'explicit-preload', 'probe_timeout_seconds': 180,
                        'seconds': preload_seconds, 'load_seconds': round(preload.json().get('load_duration', 0) / 1e9, 3)})
        scenario('warm-model', args.model, args.ollama_url)
    print(json.dumps({'kind': 'real running FastAPI HTTP requests, disposable databases',
                      'context': 'reference fixture' if args.reference_db else 'two-row upload fixture', 'results': results}))
