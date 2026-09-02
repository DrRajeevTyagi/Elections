import { createApp } from './app.js';
import { env } from './config/env.js';
import { dataStore } from './storage/datastore.js';

const bootstrap = async () => {
  await dataStore.init();

  const app = createApp();
  app.listen(env.port, '0.0.0.0', () => {
    console.log('Server listening on port ' + env.port);
    console.log('Network access enabled - accessible from other devices');
  });
};

bootstrap().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
