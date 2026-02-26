// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import { NhostClient, NhostProvider } from '@nhost/react';
import { NhostApolloProvider } from '@nhost/react-apollo';
import App from './App';
import './index.css';

const nhost = new NhostClient({
  subdomain: "afpyjlwmrdbhahnyndhl",
  region: "ap-south-1",
  autoRefreshToken: true,
  autoSignIn: true,
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <NhostProvider nhost={nhost}>
      <NhostApolloProvider nhost={nhost}>
        <App />
      </NhostApolloProvider>
    </NhostProvider>
  </React.StrictMode>
);