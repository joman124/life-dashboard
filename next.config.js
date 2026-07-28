/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    // googleapis is large and pulls in dynamic requires; keeping it external
    // avoids webpack bundling warnings and keeps it a plain Node require.
    // (libSQL / @libsql/client needs no externalization.)
    serverComponentsExternalPackages: ['googleapis'],
  },
};
