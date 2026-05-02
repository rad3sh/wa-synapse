module.exports = {
  apps: [
    {
      name: 'wa-synapse',
      script: 'dist/index.js',
      cwd: './apps/example',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
