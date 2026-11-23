/*
 * ui.test.js — o js/ui.js de verdade, montado sobre um DOM mínimo.
 *
 * ui.js desenha a página inteira; até aqui nenhum teste o executava. Este
 * arquivo o roda sem alteração dentro de um contexto do módulo vm, com um DOM
 * de mentira que guarda só o que ui.js usa: árvore de nós, classes, atributos,
 * texto e a busca por uma classe. Não mede layout nem aparência; confere o
 * texto e as classes que ui.js produz.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const M = require('../js/automato.js');
const PDA = require('../js/pda.js');
const MAPA = require('../js/mapa.js');

const CODIGO = fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8');

/* ---------- DOM mínimo ---------- */

function No(tag) {
  const no = this;
  this.tagName = String(tag).toUpperCase();
  this.filhos = [];
  this.pai = null;
  this.atributos = {};
  this.classes = [];
  this.texto = '';
  this.hidden = false;
  this.scrollTop = 0;
  this.ouvintes = {};
  this.style = { setProperty: function (nome, valor) { this[nome] = valor; } };
  this.classList = {
    contains: function (c) { return no.classes.indexOf(c) !== -1; },
    add: function (c) { if (no.classes.indexOf(c) === -1) { no.classes.push(c); } },
    remove: function (c) { no.classes = no.classes.filter(function (x) { return x !== c; }); },
    toggle: function (c, ligar) {
      const quer = ligar === undefined ? !this.contains(c) : Boolean(ligar);
      if (quer) { this.add(c); } else { this.remove(c); }
      return quer;
    }
  };
}

Object.defineProperty(No.prototype, 'className', {
  get: function () { return this.classes.join(' '); },
  set: function (v) { this.classes = String(v).split(/\s+/).filter(Boolean); }
});

Object.defineProperty(No.prototype, 'textContent', {
  get: function () {
    return this.texto + this.filhos.map(function (f) { return f.textContent; }).join('');
  },
  set: function (v) { this.filhos = []; this.texto = String(v); }
});

// ui.js só usa innerHTML para esvaziar um elemento.
Object.defineProperty(No.prototype, 'innerHTML', {
  get: function () { return ''; },
  set: function (v) {
    if (v !== '') { throw new Error('DOM mínimo: innerHTML só aceita cadeia vazia'); }
    this.filhos = [];
    this.texto = '';
  }
});

Object.defineProperty(No.prototype, 'children', {
  get: function () { return this.filhos.filter(function (f) { return f instanceof No; }); }
});

['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop', 'clientWidth', 'clientHeight', 'scrollHeight'].forEach(function (medida) {
  Object.defineProperty(No.prototype, medida, { get: function () { return 0; } });
});

No.prototype.appendChild = function (filho) {
  filho.pai = this;
  this.filhos.push(filho);
  return filho;
};
No.prototype.remove = function () {
  if (!this.pai) { return; }
  const eu = this;
  this.pai.filhos = this.pai.filhos.filter(function (f) { return f !== eu; });
  this.pai = null;
};
No.prototype.setAttribute = function (nome, valor) {
  this.atributos[nome] = String(valor);
  if (nome === 'class') { this.className = valor; }
  if (nome === 'hidden') { this.hidden = true; }
};
No.prototype.getAttribute = function (nome) {
  return Object.prototype.hasOwnProperty.call(this.atributos, nome) ? this.atributos[nome] : null;
};
No.prototype.hasAttribute = function (nome) {
  return Object.prototype.hasOwnProperty.call(this.atributos, nome);
};
No.prototype.addEventListener = function (tipo, f) {
  (this.ouvintes[tipo] = this.ouvintes[tipo] || []).push(f);
};
// Só o seletor ".classe", que é o único que ui.js usa.
No.prototype.querySelector = function (seletor) {
  if (!/^\.[\w-]+$/.test(seletor)) { throw new Error('DOM mínimo: seletor não suportado: ' + seletor); }
  const classe = seletor.slice(1);
  const pilha = this.children.slice().reverse();
  while (pilha.length) {
    const no = pilha.pop();
    if (no.classList.contains(classe)) { return no; }
    no.children.slice().reverse().forEach(function (f) { pilha.push(f); });
  }
  return null;
};
// Todos os descendentes com a classe (para as conferências dos testes).
No.prototype.todos = function (classe) {
  let achados = [];
  this.children.forEach(function (f) {
    if (f.classList.contains(classe)) { achados.push(f); }
    achados = achados.concat(f.todos(classe));
  });
  return achados;
};

function montar() {
  const porId = {};
  const documento = {
    getElementById: function (id) { return porId[id] || (porId[id] = new No('div')); },
    createElement: function (tag) { return new No(tag); },
    createElementNS: function (ns, tag) { return new No(tag); },
    createTextNode: function (texto) { return { textContent: String(texto), pai: null }; }
  };
  const contexto = vm.createContext({
    document: documento,
    setTimeout: function () { return 0; },
    clearTimeout: function () {}
  });
  vm.runInContext(CODIGO, contexto, { filename: 'js/ui.js' });
  const ui = contexto.UI.criar({ M: M, mapa: MAPA, PDA: PDA });
  return { ui: ui, id: documento.getElementById };
}

function motivoNoMapa(p) {
  return p.id('mapa').querySelector('.mapa-veredito-motivo').textContent;
}

/* ---------- a página monta ---------- */

test('ui.js monta a página inteira num DOM mínimo sem lançar exceção', function () {
  const p = montar();
  const mapa = p.id('mapa');
  assert.equal(mapa.todos('tile').length, MAPA.largura * MAPA.altura, 'um tile por posição da grade');
  assert.equal(mapa.todos('evento').length, MAPA.EVENTOS.length, 'um tile de evento por entrada de EVENTOS');
  assert.equal(mapa.todos('heroi').length, 1);
  assert.equal(mapa.todos('rotulo-regiao').length, M.estados.length);
  assert.equal(p.id('tabela-delta').children.length, M.delta.length, 'uma linha da tabela por transição');
  assert.equal(p.id('legenda-sigma').children.length, M.sigma.length);
  assert.equal(p.id('legenda-gama').children.length, M.gama.length);
  assert.equal(p.id('legenda-estados').children.length, M.estados.length);
  assert.equal(p.id('diagrama').todos('rotulo-t').length, M.delta.length, 'um rótulo no diagrama por transição');
});

test('todo método que main.js chama existe em ui.js', function () {
  const p = montar();
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
  const usados = {};
  (fonte.match(/\bui\.([A-Za-z]+)\(/g) || []).forEach(function (m) { usados[m.slice(3, -1)] = true; });
  assert.ok(Object.keys(usados).length >= 15, 'esperava achar as chamadas de main.js');
  Object.keys(usados).forEach(function (nome) {
    assert.equal(typeof p.ui[nome], 'function', 'main.js chama ui.' + nome + ', que não existe em ui.js');
  });
});

/* ---------- B3: motivo curto do veredito sobre o mapa ---------- */

test('B3: o veredito do mapa mostra o δ indefinido inteiro, qualquer que seja o símbolo rejeitado', function () {
  const p = montar();
  const casos = [
    [':', 'δ(q0, :, Z) indefinida'],
    ['x', 'δ(q0, x, Z) indefinida'],
    ['*:', 'δ(q1, :, E) indefinida'],
    [')', 'δ(q0, ), Z) indefinida'],
    [',', 'δ(q0, ,, Z) indefinida'],
    ['λ', 'δ(q0, "λ", Z) indefinida'],
    ['*b', 'δ(q1, b, E) indefinida'],
    ['*asbac', 'δ(q1, s, K) indefinida'],
    ['*sabcb', 'δ(qf, b, pilha vazia) indefinida']
  ];
  casos.forEach(function (caso) {
    const r = PDA.executar(M, caso[0]);
    assert.equal(r.aceita, false, caso[0]);
    p.ui.fim(r, null);
    assert.equal(motivoNoMapa(p), caso[1], 'cadeia "' + caso[0] + '"');
    // É sempre o começo do motivo completo mostrado no painel.
    assert.equal(r.motivo.indexOf(caso[1]), 0, 'cadeia "' + caso[0] + '"');
  });
});

test('o veredito do mapa nos outros fins: fora de F, ACEITA e reinício', function () {
  const p = montar();
  const mapa = p.id('mapa');
  const veredito = mapa.querySelector('.mapa-veredito');

  p.ui.fim(PDA.executar(M, 'a*sabc'), null);
  assert.equal(motivoNoMapa(p), 'parou em q5 ∉ F');
  assert.equal(mapa.querySelector('.mapa-veredito-titulo').textContent, 'REJEITADA');
  assert.equal(veredito.hidden, false);
  assert.equal(mapa.classList.contains('fim-rejeitada'), true);

  p.ui.fim(PDA.executar(M, '*sabc'), null);
  assert.equal(mapa.querySelector('.mapa-veredito-titulo').textContent, 'ACEITA');
  assert.match(motivoNoMapa(p), /^parou em qf ∈ F/);
  assert.equal(mapa.classList.contains('fim-aceita'), true);
  assert.equal(mapa.classList.contains('fim-rejeitada'), false);

  p.ui.fim(null);
  assert.equal(veredito.hidden, true);
  assert.equal(mapa.classList.contains('fim-aceita'), false);
});

test('a rejeição marca só o tile que a causou, e o reinício tira a marca', function () {
  const p = montar();
  const mapa = p.id('mapa');
  const passagem = MAPA.eventoDe('q1', 's');
  p.ui.fim(PDA.executar(M, '*asbac'), passagem);
  assert.equal(mapa.todos('causa').length, 1);
  assert.match(mapa.todos('causa')[0].getAttribute('title'), /Passagem rúnica/);
  p.ui.fim(null);
  assert.equal(mapa.todos('causa').length, 0);
});
