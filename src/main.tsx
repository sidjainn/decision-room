import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import App from './App.tsx';
import { DbConnection, ErrorContext } from './module_bindings/index.ts';
import './styles.css';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'decision-room-mvp';
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const onConnect = (_connection: DbConnection, identity: Identity, token: string) => {
  // A tab is one room participant. sessionStorage keeps two same-origin tabs
  // as distinct authenticated principals for the realtime demo.
  sessionStorage.setItem(TOKEN_KEY, token);
  console.info('Ansel connected', identity.toHexString().slice(0, 8));
};

const onDisconnect = () => {
  console.info('Ansel disconnected');
};

const onConnectError = (_context: ErrorContext, error: Error) => {
  console.error('Ansel connection failed', error.message);
};

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(sessionStorage.getItem(TOKEN_KEY) || undefined)
  .onConnect(onConnect)
  .onDisconnect(onDisconnect)
  .onConnectError(onConnectError);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>
);
