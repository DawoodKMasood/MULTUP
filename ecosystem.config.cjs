module.exports = {
  apps: [
    {
      name: 'multup-web',
      script: './build/bin/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'multup-queue',
      script: './build/ace.js',
      args: 'queue:listen',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
