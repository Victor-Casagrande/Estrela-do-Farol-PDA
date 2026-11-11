/*
 * jff.test.js — o pda.jff tem de dizer exatamente o mesmo que js/automato.js.
 *
 * Lê o arquivo do disco, reconstrói estados e δ a partir do XML e compara com
 * a definição usada pelo motor. Qualquer diferença (transição a mais, a
 * menos, rótulo trocado, inicial/final errado, arquivo desatualizado) falha.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const M = require('../js/automato.js');
const gerador = require('../tools/gerar-jff.js');

function desescapar(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

// Valor de <nome>…</nome> dentro do bloco; '' para <nome/>; null se ausente.
function campo(bloco, nome) {
  const cheio = new RegExp('<' + nome + '>([\\s\\S]*?)</' + nome + '>').exec(bloco);
  if (cheio) { return desescapar(cheio[1]); }
  if (new RegExp('<' + nome + '\\s*/>').test(bloco)) { return ''; }
  return null;
}

function lerJff(xml) {
  const tipo = campo(xml, 'type');
  const estados = [];
  const reEstado = /<state id="(\d+)" name="([^"]*)">([\s\S]*?)<\/state>/g;
  let m;
  while ((m = reEstado.exec(xml)) !== null) {
    estados.push({
      num: m[1],
      id: desescapar(m[2]),
      x: Number(campo(m[3], 'x')),
      y: Number(campo(m[3], 'y')),
      rotulo: campo(m[3], 'label'),
      inicial: /<initial\s*\/>/.test(m[3]),
      final: /<final\s*\/>/.test(m[3])
    });
  }
  const nomeDe = {};
  estados.forEach(function (e) { nomeDe[e.num] = e.id; });

  const delta = [];
  const reTransicao = /<transition>([\s\S]*?)<\/transition>/g;
  while ((m = reTransicao.exec(xml)) !== null) {
    delta.push({
      de: nomeDe[campo(m[1], 'from')],
      para: nomeDe[campo(m[1], 'to')],
      le: campo(m[1], 'read'),
      topo: campo(m[1], 'pop'),
      empilha: campo(m[1], 'push')
    });
  }
  return { tipo: tipo, estados: estados, delta: delta };
}

function assinatura(t) {
  return [t.de, t.le, t.topo, t.para, t.empilha].join(' | ');
}

const bruto = fs.readFileSync(gerador.DESTINO, 'utf8');
const xml = bruto.replace(/\r\n/g, '\n');
const jff = lerJff(xml);

test('pda.jff é um autômato de pilha do JFLAP', function () {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"/);
  assert.equal(jff.tipo, 'pda');
});

test('pda.jff está em dia com o gerador (não foi editado à mão nem ficou velho)', function () {
  assert.equal(xml, gerador.gerar(M), 'rode: node tools/gerar-jff.js');
});

test('os estados do .jff são os de M, com inicial e final corretos', function () {
  assert.deepEqual(jff.estados.map(function (e) { return e.id; }), M.estados.map(function (e) { return e.id; }));
  assert.deepEqual(jff.estados.filter(function (e) { return e.inicial; }).map(function (e) { return e.id; }), [M.inicial]);
  assert.deepEqual(jff.estados.filter(function (e) { return e.final; }).map(function (e) { return e.id; }), M.finais);
  jff.estados.forEach(function (e, i) {
    assert.equal(e.x, M.estados[i].x, 'x de ' + e.id);
    assert.equal(e.y, M.estados[i].y, 'y de ' + e.id);
    assert.equal(e.rotulo, M.estados[i].nome, 'rótulo de ' + e.id);
  });
});

test('nenhum estado do .jff fica em cima de outro', function () {
  jff.estados.forEach(function (a, i) {
    jff.estados.slice(i + 1).forEach(function (b) {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d >= 120, a.id + ' e ' + b.id + ' a ' + d.toFixed(0) + ' px');
    });
  });
});

test('a δ reconstruída do .jff é idêntica à δ do JavaScript', function () {
  jff.delta.forEach(function (t) {
    ['de', 'para', 'le', 'topo', 'empilha'].forEach(function (k) {
      assert.notEqual(t[k], null, 'campo ' + k + ' ausente em ' + JSON.stringify(t));
      assert.notEqual(t[k], undefined, 'campo ' + k + ' ausente em ' + JSON.stringify(t));
    });
  });
  const doJff = jff.delta.map(assinatura).sort();
  const doJs = M.delta.map(assinatura).sort();
  assert.equal(doJff.length, doJs.length, 'número de transições');
  assert.deepEqual(doJff, doJs);
});

test('λ aparece no .jff como tag vazia, e só onde a δ tem λ', function () {
  const vazias = (xml.match(/<(read|pop|push)\/>/g) || []).length;
  let esperadas = 0;
  M.delta.forEach(function (t) {
    [t.le, t.topo, t.empilha].forEach(function (v) { if (v === '') { esperadas++; } });
  });
  assert.equal(vazias, esperadas);
  assert.equal((xml.match(/<read\/>/g) || []).length, 1, 'uma única transição λ');
});
