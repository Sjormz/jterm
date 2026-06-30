import { JanetAPI } from '../main/preload';

declare global {
  interface Window {
    janet: JanetAPI;
  }
}
