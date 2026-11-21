import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetFlags } from '../src/features';

afterEach(() => {
  cleanup();
  resetFlags();
});
