import { createContext, useContext } from 'react'
import type { CollectionItem, Dataset } from '@/services/api'

export interface DatasetContextValue {
  datasets: Dataset[]; active: Dataset | null; busy: boolean
  sourceMode: CollectionItem['source_mode']; sourceId: string | null
  reload: () => Promise<void>; select: (id: string) => Promise<void>; selectCollection: (id: string) => Promise<void>
}
export const DatasetContext = createContext<DatasetContextValue>({ datasets: [], active: null, busy: false, sourceMode: 'INDIVIDUAL_FILE', sourceId: null, reload: async () => {}, select: async () => {}, selectCollection: async () => {} })
export function useDataset() { return useContext(DatasetContext) }
