#!/usr/bin/env node
/*
 * gerar-jff.js — gera pda.jff (JFLAP 7.1) a partir de js/automato.js.
 *
 * Uso:  node tools/gerar-jff.js
 *
 * O pda.jff nunca é editado à mão: ele sai da mesma δ que o motor do jogo
 * usa. tests/jff.test.js relê o arquivo e falha se houver qualquer diferença.
 *
 * Formato: no JFLAP cada transição de PDA tem <read>, <pop> e <push>; a tag
 * vazia significa λ. Em <push>, o primeiro caractere fica no topo. A pilha
 * começa com Z, que é o padrão do JFLAP.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DESTINO = path.join(__dirname, '..', 'pda.jff');

function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tag(nome, valor, recuo) {
  if (valor === '') { return recuo + '<' + nome + '/>'; }
  return recuo + '<' + nome + '>' + escapar(valor) + '</' + nome + '>';
}

function gerar(M) {
  if (M.simboloInicial !== 'Z') {
    throw new Error('O JFLAP inicia a pilha com Z; o símbolo inicial de M precisa ser Z.');
  }

  const id = {};
  M.estados.forEach(function (e, i) { id[e.id] = i; });

  const l = [];
  l.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  l.push('<!--' + M.nome + ': automato de pilha deterministico. Gerado por tools/gerar-jff.js a partir de js/automato.js; nao edite a mao.-->');
  l.push('<structure>');
  l.push('\t<type>pda</type>');
  l.push('\t<automaton>');
  l.push('\t\t<!--The list of states.-->');
  M.estados.forEach(function (e) {
    l.push('\t\t<state id="' + id[e.id] + '" name="' + escapar(e.id) + '">');
    l.push('\t\t\t<x>' + e.x.toFixed(1) + '</x>');
    l.push('\t\t\t<y>' + e.y.toFixed(1) + '</y>');
    l.push('\t\t\t<label>' + escapar(e.nome) + '</label>');
    if (e.id === M.inicial) { l.push('\t\t\t<initial/>'); }
    if (M.finais.indexOf(e.id) !== -1) { l.push('\t\t\t<final/>'); }
    l.push('\t\t</state>');
  });
  l.push('\t\t<!--The list of transitions.-->');
  M.delta.forEach(function (t) {
    l.push('\t\t<transition>');
    l.push('\t\t\t<from>' + id[t.de] + '</from>');
    l.push('\t\t\t<to>' + id[t.para] + '</to>');
    l.push(tag('read', t.le, '\t\t\t'));
    l.push(tag('pop', t.topo, '\t\t\t'));
    l.push(tag('push', t.empilha, '\t\t\t'));
    l.push('\t\t</transition>');
  });
  l.push('\t</automaton>');
  l.push('</structure>');
  return l.join('\n') + '\n';
}

if (require.main === module) {
  const M = require('../js/automato.js');
  const xml = gerar(M);
  fs.writeFileSync(DESTINO, xml, 'utf8');
  console.log('pda.jff gerado: ' + M.estados.length + ' estados, ' + M.delta.length + ' transições.');
  console.log(DESTINO);
}

module.exports = { gerar: gerar, DESTINO: DESTINO };
