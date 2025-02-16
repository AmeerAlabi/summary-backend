module.exports = {
    target: 'node',
    mode: 'production',
    resolve: {
      fallback: {
        fs: false,
        path: false,
        crypto: false
      }
    }
  };