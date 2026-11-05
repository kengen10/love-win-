// Local / VPS entry point. Vercel runs src/app.js directly as a serverless
// function, so both files export the same Express app.
const app = require('./src/app');

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Love Wins running on http://localhost:${port}`));
}
