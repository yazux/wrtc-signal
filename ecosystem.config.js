module.exports = {
    apps : [{
      name: 'ChatSignalServer',
      script: 'ts-node',
      args: './src/index.ts',
      watch: '.',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      }
    }]
  };