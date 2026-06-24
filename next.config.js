/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // Required so better-sqlite3 (native addon) is required at runtime
    // instead of being bundled by webpack in route handlers.
    // googleapis is large and pulls in dynamic requires; keeping it external
    // avoids webpack bundling warnings and keeps it a plain Node require.
    serverComponentsExternalPackages: ['better-sqlite3', 'googleapis'],
  },
};
