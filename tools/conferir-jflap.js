#!/usr/bin/env node
/*
 * conferir-jflap.js — checagem OPCIONAL do pda.jff dentro do próprio JFLAP.
 *
 * Uso:  node tools/conferir-jflap.js caminho/para/JFLAP7.1.jar
 *
 * Abre o pda.jff com o leitor de arquivos do JFLAP (file.XMLCodec), roda o
 * detector de não determinismo dele e simula as cadeias de tests/casos.js no
 * simulador de PDA dele, com aceitação por estado final.
 *
 * Precisa de um JDK com jshell no PATH. Não faz parte de "node --test": é um
 * bônus que depende da máquina. A conferência que vale para a entrega é abrir
 * o arquivo no JFLAP e usar Input > Multiple Run (ver README).
 *
 * Detalhe: o construtor de PDAStepByStateSimulator abre a janela "Accept by".
 * Aqui o objeto é criado sem passar pelo construtor e configurado direto com
 * setAcceptByFinalState(), para rodar sem interface gráfica.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CASOS = require('../tests/casos.js');
const M = require('../js/automato.js');

const jar = process.argv[2];
if (!jar || !fs.existsSync(jar)) {
  console.error('Uso: node tools/conferir-jflap.js caminho/para/JFLAP7.1.jar');
  process.exit(2);
}

const jff = path.join(__dirname, '..', 'pda.jff');

function literal(s) {
  return JSON.stringify(s);
}

const roteiro = [
  'import java.io.*; import java.util.*;',
  'automata.Automaton a = (automata.Automaton) new file.XMLCodec().decode(new File(' + literal(jff) + '), null);',
  'System.out.println("#TIPO " + a.getClass().getName());',
  'System.out.println("#ESTADOS " + a.getStates().length);',
  'System.out.println("#TRANSICOES " + a.getTransitions().length);',
  'System.out.println("#INICIAL " + a.getInitialState().getName());',
  'System.out.println("#FINAIS " + a.getFinalStates().length);',
  'System.out.println("#NAODET " + new automata.pda.PDANondeterminismDetector().getNondeterministicStates(a).length);',
  'var campoU = sun.misc.Unsafe.class.getDeclaredField("theUnsafe"); campoU.setAccessible(true);',
  'var unsafe = (sun.misc.Unsafe) campoU.get(null);',
  'var sim = (automata.pda.PDAStepByStateSimulator) unsafe.allocateInstance(automata.pda.PDAStepByStateSimulator.class);',
  'var c1 = automata.AutomatonSimulator.class.getDeclaredField("myAutomaton"); c1.setAccessible(true); c1.set(sim, a);',
  'var c2 = automata.AutomatonSimulator.class.getDeclaredField("myConfigurations"); c2.setAccessible(true); c2.set(sim, new HashSet<automata.Configuration>());',
  'sim.setAcceptByFinalState();',
  'String[] cadeias = {' + CASOS.map(function (c) { return literal(c.cadeia); }).join(', ') + '};',
  'for (int i = 0; i < cadeias.length; i++) System.out.println("#CASO " + i + " " + (sim.simulateInput(cadeias[i]) ? "A" : "R"));',
  '/exit',
  ''
].join('\n');

const r = spawnSync('jshell', ['--class-path', jar, '-R-Djava.awt.headless=true', '-'], {
  input: roteiro,
  encoding: 'utf8',
  timeout: 180000
});

if (r.error) {
  console.error('Não consegui rodar o jshell (JDK no PATH?): ' + r.error.message);
  process.exit(2);
}

const saida = String(r.stdout || '');
function valor(nome) {
  const m = new RegExp('^#' + nome + ' (.*)$', 'm').exec(saida);
  return m ? m[1].trim() : null;
}

let falhas = 0;
function conferir(descricao, obtido, esperado) {
  const ok = String(obtido) === String(esperado);
  if (!ok) { falhas++; }
  console.log((ok ? '  ok    ' : '  FALHA ') + descricao + (ok ? '' : '  (JFLAP: ' + obtido + ', esperado: ' + esperado + ')'));
}

console.log('pda.jff aberto pelo JFLAP (' + path.basename(jar) + '):');
conferir('tipo PushdownAutomaton', valor('TIPO'), 'automata.pda.PushdownAutomaton');
conferir(M.estados.length + ' estados', valor('ESTADOS'), M.estados.length);
conferir(M.delta.length + ' transições', valor('TRANSICOES'), M.delta.length);
conferir('estado inicial ' + M.inicial, valor('INICIAL'), M.inicial);
conferir(M.finais.length + ' estado final', valor('FINAIS'), M.finais.length);
conferir('0 estados não determinísticos', valor('NAODET'), 0);

console.log('Simulação no JFLAP, aceitação por estado final:');
CASOS.forEach(function (c, i) {
  const m = new RegExp('^#CASO ' + i + ' ([AR])$', 'm').exec(saida);
  const obtido = m ? (m[1] === 'A' ? 'ACEITA' : 'REJEITADA') : 'sem resposta';
  conferir('"' + c.cadeia + '" → ' + (c.aceita ? 'ACEITA' : 'REJEITADA'), obtido, c.aceita ? 'ACEITA' : 'REJEITADA');
});

if (falhas > 0) {
  console.error('\n' + falhas + ' diferença(s). Saída do jshell:\n' + saida + String(r.stderr || ''));
  process.exit(1);
}
console.log('\nTudo igual: o JFLAP e o motor do jogo concordam em ' + CASOS.length + ' cadeias.');
