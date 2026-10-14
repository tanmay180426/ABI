"""Verify an already installed local model through the real Insights router.

No model download or persistent configuration change. Never print prompts/answers.
"""
import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from tests.database_fixture import test_storage

parser = argparse.ArgumentParser()
parser.add_argument('--model', required=True, help='An already installed Ollama model identifier.')
parser.add_argument('--base-url', default='http://localhost:11434')
parser.add_argument('--timeout', type=int, default=90, help='Probe-only generation timeout; does not change application defaults.')
args = parser.parse_args()
for key in list(os.environ):
    if any(provider in key.upper() for provider in ('OPENAI', 'ANTHROPIC', 'GEMINI', 'OPENROUTER')) and any(secret in key.upper() for secret in ('KEY', 'TOKEN')):
        os.environ.pop(key)
with test_storage(ROOT / 'backend/sem5.db') as path:
    os.environ['DATABASE_URL'] = 'sqlite:///' + path.as_posix()
    os.environ['ENABLE_LLM_ASSISTANT'] = 'true'
    os.environ['LLM_PROVIDER'] = 'ollama'
    os.environ['OLLAMA_BASE_URL'] = args.base_url
    os.environ['OLLAMA_MODEL'] = args.model
    os.environ['LLM_TIMEOUT_SECONDS'] = str(args.timeout)
    os.environ['AUTH_ANALYST_PASSWORD'] = 'analyst123'
    from app.main import app
    from app.database.session import engine
    from fastapi.testclient import TestClient
    try:
        with TestClient(app) as client:
            login = client.post('/api/auth/login', data={'username': 'analyst', 'password': 'analyst123'})
            assert login.status_code == 200
            headers = {'Authorization': 'Bearer ' + login.json()['access_token']}
            status = client.get('/api/insights/status', headers=headers).json()
            assert status['reachable'] is True and status['provider'] == 'ollama'
            numerical = client.post('/api/insights/query', headers=headers,
                json={'question': 'What is the total revenue?'}).json()
            assert numerical['provider'] == 'computed' and numerical['status'] == 'available'
            generated = client.post('/api/insights/query', headers=headers,
                json={'question': 'Say only OK if the supplied context is readable.'}).json()
            assert generated['provider'] == 'ollama' and generated['status'] == 'available', 'Local generation unavailable.'
            assert generated['answer'].strip()
            assert generated['dataset_id'] == numerical['dataset_id']
            print(json.dumps({'local_model': args.model, 'reachable': True,
                'numerical_provider': numerical['provider'], 'generation_provider': generated['provider'],
                'generation_status': generated['status'], 'answer_characters': len(generated['answer']),
                'dataset_scope_matches': True, 'storage': 'disposable reference copy'}))
    finally:
        engine.dispose()
