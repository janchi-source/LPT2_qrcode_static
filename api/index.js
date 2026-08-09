// Vstupný bod pre Vercel — všetky /api/* požiadavky idú sem.
// Statické súbory (public/) servuje Vercel sám.
const { handler } = require('../lib/handler');
module.exports = (req, res) => handler(req, res);
