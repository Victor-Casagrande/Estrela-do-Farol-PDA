/*
 * casos.js — cadeias de teste e o resultado esperado de cada uma.
 * As quatro primeiras são os exemplos da interface; as demais são extras.
 * A mesma lista está no README, pronta para o Multiple Run do JFLAP.
 */
'use strict';

module.exports = [
  { cadeia: '*sabc', aceita: true, porque: 'rota da Gruta' },
  { cadeia: 'a*aabbscb', aceita: true, porque: 'rota da Ponte, contagem aninhada' },
  { cadeia: '*asbac', aceita: false, porque: 'ordem errada: chave sobre a estrela' },
  { cadeia: 'a*sabc', aceita: false, porque: 'termina em q5 com uma chave: fora de F' },

  { cadeia: 'a*sabcb', aceita: true, porque: 'exemplo 4 corrigido: a chave vai para a urna' },
  { cadeia: '*absc', aceita: true, porque: 'rota da Ponte mínima' },
  { cadeia: 'aa*sabcbb', aceita: true, porque: 'duas chaves antes da estrela, duas na urna' },
  { cadeia: 'aaa*aaabbbscbbb', aceita: true, porque: 'a^3 * a^3 b^3 s c b^3' },

  { cadeia: '', aceita: false, porque: 'cadeia vazia: q0 não é final' },
  { cadeia: '*', aceita: false, porque: 'para na Colina' },
  { cadeia: '*b', aceita: false, porque: 'falta de chave no portão' },
  { cadeia: '*saabc', aceita: false, porque: 'chave demais na Gruta: sobra uma sobre a estrela' },
  { cadeia: '**', aceita: false, porque: 'só existe uma estrela' },
  { cadeia: '*sabcb', aceita: false, porque: 'símbolo depois de qf' },
  { cadeia: 'sabc', aceita: false, porque: 'sem estrela' },
  { cadeia: '*sc', aceita: false, porque: 'portal não fica na Gruta' },
  { cadeia: 'aa*sabcb', aceita: false, porque: 'duas chaves antes da estrela, uma na urna' },
  { cadeia: 'a*sabcbb', aceita: false, porque: 'uma chave antes da estrela, duas na urna' },
  { cadeia: '*aabsc', aceita: false, porque: 'ponte fechada: ainda há chave sobre a estrela' }
];
