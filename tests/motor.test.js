/*
 * motor.test.js — o motor de PDA contra a definição de M.
 * Rodar:  node --test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const M = require('../js/automato.js');
const PDA = require('../js/pda.js');
const CASOS = require('./casos.js');

// Trace esperado dos 4 exemplos: [estado, lido, pilha] depois de cada passo.
// É o que está no README e no plano; 'λ' marca o movimento vazio.
const TRACES = {
  '*sabc': [
    ['q1', '*', 'EZ'], ['q2', 's', 'EZ'], ['q2', 'a', 'KEZ'], ['q4', 'b', 'EZ'],
    ['q5', 'c', 'Z'], ['qf', 'λ', '']
  ],
  'a*aabbscb': [
    ['q0', 'a', 'KZ'], ['q1', '*', 'EKZ'], ['q1', 'a', 'KEKZ'], ['q1', 'a', 'KKEKZ'],
    ['q3', 'b', 'KEKZ'], ['q3', 'b', 'EKZ'], ['q4', 's', 'EKZ'], ['q5', 'c', 'KZ'],
    ['q5', 'b', 'Z'], ['qf', 'λ', '']
  ],
  '*asbac': [
    ['q1', '*', 'EZ'], ['q1', 'a', 'KEZ'], ['q1', 's', 'KEZ']
  ],
  'a*sabc': [
    ['q0', 'a', 'KZ'], ['q1', '*', 'EKZ'], ['q2', 's', 'EKZ'], ['q2', 'a', 'KEKZ'],
    ['q4', 'b', 'EKZ'], ['q5', 'c', 'KZ']
  ]
};

function trace(resultado) {
  return resultado.historico.map(function (r) {
    return [r.estado, PDA.mostrar(r.lido), r.pilha];
  });
}

test('a definição de M é válida', function () {
  const v = PDA.validar(M);
  assert.deepEqual(v.erros, []);
  assert.equal(v.ok, true);
});

test('M segue o enunciado: 5 a 10 estados, Σ = {*, a, s, b, c}, Γ maiúsculo com Z inicial', function () {
  assert.ok(M.estados.length >= 5 && M.estados.length <= 10, 'número de estados');
  assert.deepEqual(M.sigma.map(function (s) { return s.simbolo; }).sort(), ['*', 'a', 'b', 'c', 's']);
  M.gama.forEach(function (g) {
    assert.match(g.simbolo, /^[A-Z]$/, 'símbolo de pilha maiúsculo: ' + g.simbolo);
  });
  assert.equal(M.simboloInicial, 'Z');
  assert.equal(M.inicial, 'q0');
  assert.deepEqual(M.finais, ['qf']);
});

test('todo símbolo de Σ e de Γ é usado por alguma transição, e todo estado é alcançável', function () {
  M.sigma.forEach(function (s) {
    assert.ok(M.delta.some(function (t) { return t.le === s.simbolo; }), 'Σ sem uso: ' + s.simbolo);
  });
  M.gama.forEach(function (g) {
    assert.ok(M.delta.some(function (t) { return t.topo === g.simbolo; }), 'Γ sem uso: ' + g.simbolo);
  });
  const vistos = [M.inicial];
  for (let i = 0; i < vistos.length; i++) {
    M.delta.forEach(function (t) {
      if (t.de === vistos[i] && vistos.indexOf(t.para) === -1) { vistos.push(t.para); }
    });
  }
  assert.deepEqual(vistos.slice().sort(), M.estados.map(function (e) { return e.id; }).sort());
});

test('determinismo: no máximo uma transição por (estado, símbolo, topo) e λ sem conflito', function () {
  const vistas = {};
  M.delta.forEach(function (t) {
    const k = t.de + '|' + t.le + '|' + t.topo;
    assert.equal(vistas[k], undefined, 'transição repetida para ' + k);
    vistas[k] = true;
  });
  M.delta.filter(function (t) { return t.le === ''; }).forEach(function (lambda) {
    M.delta.forEach(function (t) {
      if (t === lambda || t.de !== lambda.de) { return; }
      assert.notEqual(t.topo, lambda.topo, 'λ conflita com ' + PDA.rotulo(t) + ' em ' + t.de);
    });
  });
});

test('o validador acusa um autômato não determinístico', function () {
  const ruim = Object.assign({}, M, {
    delta: M.delta.concat([{ de: 'q5', le: 'b', topo: 'Z', para: 'q5', empilha: 'Z' }])
  });
  const v = PDA.validar(ruim);
  assert.equal(v.ok, false);
  assert.match(v.erros.join('\n'), /Não determinismo em q5/);
  assert.throws(function () { PDA.criar(ruim); }, /Autômato inválido/);
});

test('a entrada em qf é "λ, Z; λ": aceitar deixa a pilha vazia', function () {
  const entradas = M.delta.filter(function (t) { return t.para === 'qf'; });
  assert.equal(entradas.length, 1);
  assert.equal(PDA.rotulo(entradas[0]), 'λ, Z; λ');
  CASOS.filter(function (c) { return c.aceita; }).forEach(function (c) {
    const r = PDA.executar(M, c.cadeia);
    assert.equal(r.estado, 'qf', c.cadeia);
    assert.equal(r.pilha, '', c.cadeia);
  });
});

test('os 4 exemplos da interface: 2 aceitos, 2 rejeitados por motivos diferentes', function () {
  assert.equal(M.exemplos.length, 4);
  assert.equal(M.exemplos.filter(function (e) { return e.aceita; }).length, 2);
  const tipos = [];
  M.exemplos.forEach(function (ex) {
    const r = PDA.executar(M, ex.cadeia);
    assert.equal(r.aceita, ex.aceita, ex.cadeia);
    assert.deepEqual(trace(r), TRACES[ex.cadeia], 'trace de ' + ex.cadeia);
    if (!r.aceita) { tipos.push(r.tipo); }
  });
  assert.deepEqual(tipos.sort(), ['fora-de-F', 'indefinida']);
});

test('exemplo 3 para no símbolo sem transição e deixa o resto sem ler', function () {
  const r = PDA.executar(M, '*asbac');
  assert.equal(r.consumidos, '*as');
  assert.equal(r.restante, 'bac');
  assert.equal(r.estado, 'q1');
  assert.match(r.motivo, /δ\(q1, s, K\) indefinida/);
  assert.match(r.motivo, /exige E \(estrela\) no topo da pilha, mas o topo é K \(chave\)/);
});

test('exemplo 4 consome tudo e é rejeitado por terminar fora de F', function () {
  const r = PDA.executar(M, 'a*sabc');
  assert.equal(r.restante, '');
  assert.equal(r.estado, 'q5');
  assert.equal(r.pilha, 'KZ');
  assert.match(r.motivo, /não pertence a F/);
  assert.match(r.motivo, /δ\(q5, λ, K\) indefinida/);
});

CASOS.forEach(function (c) {
  test('cadeia "' + c.cadeia + '" → ' + (c.aceita ? 'ACEITA' : 'REJEITADA') + ' (' + c.porque + ')', function () {
    assert.equal(PDA.executar(M, c.cadeia).aceita, c.aceita);
  });
});

test('símbolo fora de Σ rejeita com aviso', function () {
  const r = PDA.executar(M, '*xs');
  assert.equal(r.aceita, false);
  assert.equal(r.tipo, 'fora-de-sigma');
  assert.equal(r.restante, 's');
  assert.match(r.motivo, /"x" não pertence a Σ/);
});

test('falta de chave: o motivo vem da própria δ', function () {
  const r = PDA.executar(M, '*b');
  assert.match(r.motivo, /δ\(q1, b, E\) indefinida/);
  assert.match(r.motivo, /exige K \(chave\) no topo da pilha, mas o topo é E \(estrela\)/);
});

test('consultar não altera a configuração', function () {
  const m = PDA.criar(M);
  m.passo('*');
  const antes = [m.estado, m.pilha, m.consumidos, m.historico.length];
  assert.equal(PDA.rotulo(m.consultar('s')), 's, E; E');
  assert.equal(m.consultar('b'), null);
  assert.equal(m.consultar('x'), null);
  assert.deepEqual([m.estado, m.pilha, m.consumidos, m.historico.length], antes);
});

test('a λ é aplicada assim que habilitada e tem registro próprio', function () {
  const m = PDA.criar(M);
  ['*', 's', 'a', 'b'].forEach(function (s) { m.passo(s); });
  const r = m.passo('c');
  assert.equal(r.ok, true);
  assert.equal(r.registros.length, 2);
  assert.equal(r.registros[0].lido, 'c');
  assert.equal(r.registros[0].estado, 'q5');
  assert.equal(r.registros[1].lido, '');
  assert.equal(r.registros[1].estadoAntes, 'q5');
  assert.equal(r.registros[1].estado, 'qf');
  assert.equal(m.encerrar().aceita, true);
});

test('jogadas possíveis e beco sem saída', function () {
  const m = PDA.criar(M);
  assert.deepEqual(m.jogadasPossiveis().simbolos, ['*', 'a']);
  assert.equal(m.semSaida(), false);

  ['*', 's', 'a', 'a', 'b'].forEach(function (s) { m.passo(s); });
  assert.equal(m.estado, 'q4');
  assert.equal(m.topo(), 'K');
  assert.deepEqual(m.jogadasPossiveis().simbolos, []);
  assert.equal(m.semSaida(), true);
  const texto = PDA.explicarSemSaida(M, m.estado, m.topo());
  assert.match(texto, /Beco sem saída em q4 \(Pátio do Portal\) com K \(chave\) no topo/);
  assert.match(texto, /"c, E; λ"/);

  const aceita = PDA.criar(M);
  ['*', 's', 'a', 'b', 'c'].forEach(function (s) { aceita.passo(s); });
  assert.equal(aceita.estado, 'qf');
  assert.equal(aceita.semSaida(), false, 'estado final não é beco');
});

test('nenhuma outra configuração alcançável em poucos passos é beco, além do Pátio com chave no topo', function () {
  const becos = {};
  const alfabeto = M.sigma.map(function (s) { return s.simbolo; });
  (function explorar(prefixo) {
    const m = PDA.criar(M);
    let ok = true;
    Array.from(prefixo).forEach(function (s) { ok = ok && m.passo(s).ok; });
    if (!ok) { return; }
    if (m.semSaida()) { becos[m.estado + ',' + m.topo()] = true; }
    if (prefixo.length < 7) { alfabeto.forEach(function (s) { explorar(prefixo + s); }); }
  }(''));
  assert.deepEqual(Object.keys(becos), ['q4,K']);
});

test('depois de encerrada, a máquina não lê mais nada', function () {
  const m = PDA.criar(M);
  m.passo('*');
  m.passo('b');
  assert.equal(m.resultado.aceita, false);
  assert.deepEqual(m.passo('a'), { ok: false, registros: [] });
  assert.equal(m.consumidos, '*b');
});
