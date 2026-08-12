import 'dotenv/config';
import { buildEnv } from './envModel.js';

export const env = buildEnv(process.env);
