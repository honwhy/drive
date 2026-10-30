import { createApp } from './app/app';
import { installAutoFullscreen } from './app/fullscreen';
import { registerServiceWorker } from './app/sw-register';
import './styles.css';

const root = document.getElementById('app');

if (!root) {
  throw new Error('缺少 #app 挂载点');
}

createApp(root);
installAutoFullscreen();
registerServiceWorker();
