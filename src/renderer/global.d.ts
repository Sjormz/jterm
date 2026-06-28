import { JTermAPI } from '../main/preload';

declare global {
  interface Window {
    jterm: JTermAPI;
  }
}
