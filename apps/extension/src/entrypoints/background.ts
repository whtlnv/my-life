import { defineBackground } from 'wxt/utils/define-background';

import { backendUrl } from '../backend-url';

export default defineBackground(() => {
  console.log(`my-life extension loaded; backend at ${backendUrl(undefined)}`);
});
