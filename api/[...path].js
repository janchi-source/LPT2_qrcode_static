// Poistka, nie duplicita: routovanie zabezpečuje rewrite vo vercel.json, tento
// súbor zachytí /api/* aj vtedy, keby rewrite z akéhokoľvek dôvodu neplatil.
// Cesta sa preto v lib/handler.js zisťuje aj z URL, nielen z ?cesta=.
module.exports = require('./index.js');
