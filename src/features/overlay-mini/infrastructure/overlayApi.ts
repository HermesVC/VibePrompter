import type { InlineEdit } from '../domain';

const SAMPLE: InlineEdit = {
  mode: 'Improved Writing',
  modeIconName: 'wand',
  original: 'the function basically just loops through the items and skips the ones that are null',
  improved:
    'The function iterates over the collection, filtering out null entries before processing.',
};

export const overlayApi = {
  getCurrentEdit: async (): Promise<InlineEdit> => SAMPLE,
};
