/*
 * mapa.test.js — o mapa concorda com a δ, e o jogo obedece ao PDA.
 *
 * Primeira parte: coerência estática entre js/mapa.js e js/automato.js.
 * Segunda parte: partidas simuladas (sem navegador) pela lógica de game.js.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const M = require('../js/automato.js');
const PDA = require('../js/pda.js');
const MAPA = require('../js/mapa.js');
const JOGO = require('../js/game.js');
const CASOS = require('./casos.js');

function novoJogo() {
  return JOGO.criar({ M: M, mapa: MAPA, PDA: PDA });
}

function destinos(estado, simbolo) {
  const alvos = M.delta
    .filter(function (t) { return t.de === estado && t.le === simbolo; })
    .map(function (t) { return t.para; });
  return alvos.filter(function (v, i) { return alvos.indexOf(v) === i; });
}

function invariante(jogo, quando) {
  assert.equal(
    MAPA.regiaoDe(jogo.heroi.x, jogo.heroi.y), jogo.maquina.estado,
    'região da personagem ≠ estado do PDA ' + quando
  );
}

// Anda até um tile de acesso do evento (estado, simbolo) e toca nele.
function tocar(jogo, simbolo, repeticao) {
  const ev = MAPA.eventoDe(jogo.maquina.estado, simbolo);
  assert.ok(ev, 'não há tile de "' + simbolo + '" em ' + jogo.maquina.estado);
  const rota = MAPA.caminhoAte(jogo.heroi, ev);
  assert.ok(rota, 'sem caminho até ' + ev.nome);
  for (let i = 1; i < rota.caminho.length; i++) {
    const p = rota.caminho[i];
    const r = jogo.tentarMover(p.x - jogo.heroi.x, p.y - jogo.heroi.y, false);
    assert.equal(r.tipo, 'andou');
  }
  assert.equal(jogo.fita.length, jogo.maquina.consumidos.length);
  return jogo.tentarMover(rota.acesso.dx, rota.acesso.dy, Boolean(repeticao));
}

/* ---------- coerência estática ---------- */

test('a grade é retangular e só usa caracteres conhecidos', function () {
  MAPA.GRADE.forEach(function (linha, y) {
    assert.equal(linha.length, MAPA.largura, 'linha ' + y);
    assert.match(linha, /^[#~.@oLT*SBGPUC^]+$/, 'linha ' + y);
  });
  assert.equal(MAPA.GRADE.join('').split('@').length - 1, 1, 'um único ponto de início');
});

test('cada estado tem uma região própria e todo chão pertence a exatamente uma', function () {
  assert.deepEqual(MAPA.conflitos, [], 'regiões se tocam sem passar por um evento');
  assert.deepEqual(Object.keys(MAPA.SEMENTES).sort(), M.estados.map(function (e) { return e.id; }).sort());
  M.estados.forEach(function (e) {
    assert.ok(MAPA.tilesDe(e.id).length > 0, 'região vazia: ' + e.id);
  });
  for (let y = 0; y < MAPA.altura; y++) {
    for (let x = 0; x < MAPA.largura; x++) {
      if (MAPA.caminhavel(x, y)) {
        assert.notEqual(MAPA.regiaoDe(x, y), null, 'chão sem região em ' + x + ',' + y);
      }
    }
  }
  assert.equal(MAPA.regiaoDe(MAPA.inicio.x, MAPA.inicio.y), M.inicial);
});

test('cada tile de evento está desenhado na grade com o caractere do seu tipo', function () {
  MAPA.EVENTOS.forEach(function (ev) {
    assert.equal(MAPA.tile(ev.x, ev.y), MAPA.CARACTERE[ev.tipo], ev.nome);
    assert.equal(MAPA.caminhavel(ev.x, ev.y), false, ev.nome + ' deve ser sólido');
  });
  let naGrade = 0;
  MAPA.GRADE.forEach(function (linha) { naGrade += (linha.match(/[T*SBGPUC^]/g) || []).length; });
  assert.equal(naGrade, MAPA.EVENTOS.length, 'tile de evento na grade sem entrada em EVENTOS');
});

test('cada par (estado, símbolo) da δ tem um único destino e exatamente um tile', function () {
  const pares = {};
  M.delta.forEach(function (t) { pares[t.de + '|' + t.le] = true; });
  Object.keys(pares).forEach(function (par) {
    const estado = par.split('|')[0];
    const simbolo = par.split('|')[1];
    assert.equal(destinos(estado, simbolo).length, 1, 'destinos diferentes para ' + par);
    const tiles = MAPA.EVENTOS.filter(function (ev) { return ev.estado === estado && ev.simbolo === simbolo; });
    assert.equal(tiles.length, 1, 'tiles para ' + par);
  });
});

test('todo tile de evento corresponde a alguma transição (incluindo a escada da λ)', function () {
  MAPA.EVENTOS.forEach(function (ev) {
    assert.ok(destinos(ev.estado, ev.simbolo).length === 1, ev.nome + ' sem transição na δ');
  });
  const lambdas = M.delta.filter(function (t) { return t.le === ''; });
  lambdas.forEach(function (t) {
    const escada = MAPA.eventoDe(t.de, '');
    assert.ok(escada, 'transição λ de ' + t.de + ' sem tile');
    assert.equal(escada.tipo, 'escada');
  });
});

test('todo evento é alcançável da sua região e leva à região de destino da δ', function () {
  MAPA.EVENTOS.forEach(function (ev) {
    const acessos = MAPA.acessos(ev);
    assert.ok(acessos.length > 0, ev.nome + ' inacessível de ' + ev.estado);
    const destino = destinos(ev.estado, ev.simbolo)[0];
    if (destino === ev.estado) { return; }
    acessos.forEach(function (acesso) {
      const saida = MAPA.saidaDe(ev, acesso);
      assert.ok(MAPA.caminhavel(saida.x, saida.y), ev.nome + ': saída não é chão');
      assert.equal(MAPA.regiaoDe(saida.x, saida.y), destino, ev.nome + ': saída na região errada');
    });
  });
});

test('travessias são de mão única: do lado de lá o tile não é acessível', function () {
  MAPA.EVENTOS.forEach(function (ev) {
    MAPA.VIZINHOS.forEach(function (v) {
      const x = ev.x + v.dx;
      const y = ev.y + v.dy;
      const regiao = MAPA.regiaoDe(x, y);
      if (regiao && regiao !== ev.estado) {
        const jogo = novoJogo();
        jogo.heroi = { x: x, y: y };
        jogo.maquina.estado = regiao;
        assert.equal(jogo.tentarMover(-v.dx, -v.dy, false).tipo, 'parede', ev.nome + ' visto de ' + regiao);
      }
    });
  });
});

/* ---------- partidas simuladas ---------- */

test('WASD: o percurso da rota da Gruta gera a fita "*sabc" e é ACEITA', function () {
  const jogo = novoJogo();
  invariante(jogo, 'no início');
  ['*', 's', 'a', 'b', 'c'].forEach(function (s) {
    const r = tocar(jogo, s);
    assert.equal(r.tipo, 'evento', 'símbolo ' + s);
    invariante(jogo, 'depois de ' + s);
  });
  assert.equal(jogo.fita, '*sabc');
  assert.equal(jogo.maquina.estado, 'qf');
  assert.equal(jogo.resultado.aceita, true, 'chegar a qf encerra o percurso');
});

test('a transição λ leva a personagem pela escada até a região da Lanterna', function () {
  const jogo = novoJogo();
  ['*', 's', 'a', 'b'].forEach(function (s) { tocar(jogo, s); });
  const r = tocar(jogo, 'c');
  assert.deepEqual(r.atos.map(function (a) { return a.tipo; }), ['travessia', 'lambda']);

  const portal = r.atos[0];
  assert.equal(portal.registro.estado, 'q5');
  assert.equal(portal.quadros[0].salto, true);
  assert.equal(MAPA.regiaoDe(portal.quadros[0].x, portal.quadros[0].y), 'q5', 'o portal deixa no Farol');

  const lambda = r.atos[1];
  const escada = MAPA.eventoDe('q5', '');
  assert.equal(lambda.registro.lido, '');
  assert.equal(lambda.registro.estado, 'qf');
  const q = lambda.quadros;
  assert.deepEqual(q[q.length - 2], { x: escada.x, y: escada.y }, 'passa pelo tile da escada');
  assert.equal(MAPA.regiaoDe(q[q.length - 1].x, q[q.length - 1].y), 'qf');
  q.slice(0, -2).forEach(function (p) {
    assert.equal(MAPA.regiaoDe(p.x, p.y), 'q5', 'antes da escada ainda está no Farol');
  });
  assert.equal(lambda.aplicarEm, q.length - 1);
  assert.deepEqual(jogo.heroi, q[q.length - 1]);
  invariante(jogo, 'depois da λ');
});

test('segurar a tecla diante da árvore não colhe nada; soltar e apertar colhe uma chave', function () {
  const jogo = novoJogo();
  const segurando = tocar(jogo, 'a', true);
  assert.equal(segurando.tipo, 'repeticao');
  assert.equal(jogo.fita, '');
  assert.equal(jogo.maquina.pilha, 'Z');

  for (let i = 0; i < 5; i++) {
    assert.equal(jogo.tentarMover(-1, 0, true).tipo, 'repeticao');
  }
  assert.equal(jogo.fita, '');

  assert.equal(jogo.tentarMover(-1, 0, false).tipo, 'evento');
  assert.equal(jogo.fita, 'a');
  assert.equal(jogo.maquina.pilha, 'KZ');
  assert.equal(jogo.tentarMover(-1, 0, true).tipo, 'repeticao');
  assert.equal(jogo.fita, 'a', 'cada toque gera exatamente um símbolo');
});

test('tiles de evento são sólidos: a personagem nunca fica em cima de um', function () {
  const jogo = novoJogo();
  ['a', '*', 'a', 'a', 'b', 'b', 's', 'c', 'b'].forEach(function (s) {
    if (jogo.resultado) { return; }
    assert.equal(tocar(jogo, s).tipo, 'evento', 'símbolo ' + s);
    assert.equal(MAPA.eventoEm(jogo.heroi.x, jogo.heroi.y), null, 'em cima de um evento depois de ' + s);
    assert.equal(MAPA.caminhavel(jogo.heroi.x, jogo.heroi.y), true, 'fora do chão depois de ' + s);
  });
  assert.equal(jogo.fita, 'a*aabbscb');
  assert.equal(jogo.resultado.aceita, true);
});

test('Modo Jogo: obstáculo sem transição bloqueia e nada entra na fita', function () {
  const jogo = novoJogo();
  tocar(jogo, '*');
  const r = tocar(jogo, 'b');
  assert.equal(r.tipo, 'bloqueado');
  assert.match(r.motivo, /δ\(q1, b, E\) indefinida/);
  assert.equal(jogo.fita, '*');
  assert.equal(jogo.maquina.estado, 'q1');
  assert.equal(jogo.maquina.pilha, 'EZ');
  assert.equal(jogo.resultado, null);
  invariante(jogo, 'depois do bloqueio');

  tocar(jogo, 'a');
  assert.equal(tocar(jogo, 's').tipo, 'bloqueado', 'passagem fechada com chave sobre a estrela');
  assert.equal(tocar(jogo, 'b').tipo, 'evento', 'o portão agora abre');
  assert.equal(jogo.fita, '*ab');
});

test('Modo Estrito: a mesma tentativa entra na fita e rejeita', function () {
  const jogo = novoJogo();
  jogo.modoEstrito = true;
  tocar(jogo, '*');
  const r = tocar(jogo, 'b');
  assert.equal(r.tipo, 'rejeitada');
  assert.equal(jogo.fita, '*b');
  assert.equal(jogo.resultado.aceita, false);
  assert.match(jogo.resultado.motivo, /δ\(q1, b, E\) indefinida/);
  assert.equal(jogo.tentarMover(1, 0, false).tipo, 'encerrado');
});

test('evento irreversível sem transição rejeita mesmo no Modo Jogo (portal com chave no topo)', function () {
  const jogo = novoJogo();
  ['*', 's', 'a', 'a', 'b'].forEach(function (s) { tocar(jogo, s); });
  assert.equal(jogo.maquina.estado, 'q4');
  assert.match(jogo.becoSemSaida(), /Beco sem saída em q4/);
  assert.deepEqual(jogo.dicas(), []);
  invariante(jogo, 'no beco');

  const r = tocar(jogo, 'c');
  assert.equal(r.tipo, 'rejeitada');
  assert.equal(jogo.fita, '*saabc');
  assert.equal(jogo.resultado.aceita, false);
  assert.equal(jogo.becoSemSaida(), null, 'percurso já encerrado');
});

test('dicas consultam o motor sem consumir símbolo', function () {
  const jogo = novoJogo();
  tocar(jogo, '*');
  const ev = MAPA.eventoDe('q1', 'b');
  const rota = MAPA.caminhoAte(jogo.heroi, ev);
  rota.caminho.slice(1).forEach(function (p) {
    jogo.tentarMover(p.x - jogo.heroi.x, p.y - jogo.heroi.y, false);
  });
  const antes = [jogo.fita, jogo.maquina.estado, jogo.maquina.pilha];
  const dicas = jogo.dicas();
  assert.equal(dicas.length, 1);
  assert.equal(dicas[0].tecla, 'D');
  assert.equal(dicas[0].simbolo, 'b');
  assert.equal(dicas[0].efeito, 'bloqueia');
  jogo.modoEstrito = true;
  assert.equal(jogo.dicas()[0].efeito, 'rejeita');
  assert.deepEqual([jogo.fita, jogo.maquina.estado, jogo.maquina.pilha], antes);
});

test('"Encerrar percurso" fora de F rejeita; a fita pode ser reexecutada como roteiro', function () {
  const jogo = novoJogo();
  ['a', '*', 's', 'a', 'b', 'c'].forEach(function (s) { tocar(jogo, s); });
  assert.equal(jogo.resultado, null, 'q5 com chave: ainda há jogada (urna)');
  const fim = jogo.encerrar();
  assert.equal(fim.aceita, false);
  assert.equal(fim.tipo, 'fora-de-F');
  assert.equal(jogo.fita, 'a*sabc');
  assert.equal(PDA.executar(M, jogo.fita).aceita, false);
});

test('roteiro: cada cadeia de teste dá no jogo o mesmo resultado do motor, com a personagem na região do estado', function () {
  CASOS.forEach(function (c) {
    const jogo = novoJogo();
    Array.from(c.cadeia).forEach(function (s) {
      if (jogo.resultado) { return; }
      const r = jogo.processarSimbolo(s);
      r.atos.forEach(function (ato) {
        ato.quadros.forEach(function (p) {
          assert.ok(
            MAPA.caminhavel(p.x, p.y) || MAPA.eventoEm(p.x, p.y) !== null,
            'quadro fora do chão em "' + c.cadeia + '"'
          );
        });
      });
      invariante(jogo, 'em "' + c.cadeia + '" depois de ' + s);
    });
    assert.equal(jogo.encerrar().aceita, c.aceita, c.cadeia);
    const direto = PDA.executar(M, c.cadeia);
    assert.equal(jogo.maquina.estado, direto.estado, c.cadeia);
    assert.equal(jogo.maquina.pilha, direto.pilha, c.cadeia);
  });
});

test('roteiro: no símbolo sem transição não há bloqueio, é REJEITADA', function () {
  const jogo = novoJogo();
  assert.equal(jogo.processarSimbolo('*').tipo, 'evento');
  assert.equal(jogo.processarSimbolo('a').tipo, 'evento');
  const r = jogo.processarSimbolo('s');
  assert.equal(r.tipo, 'rejeitada');
  assert.equal(r.atos[r.atos.length - 1].tipo, 'rejeicao');
  assert.equal(jogo.resultado.aceita, false);
  assert.equal(jogo.processarSimbolo('b').tipo, 'encerrado');
});

test('roteiro: símbolo fora de Σ rejeita com aviso', function () {
  const jogo = novoJogo();
  const r = jogo.processarSimbolo('x');
  assert.equal(r.tipo, 'rejeitada');
  assert.match(jogo.resultado.motivo, /não pertence a Σ/);
});

test('roteiro: depois de qf qualquer símbolo rejeita (qf não encerra sozinho no roteiro)', function () {
  const jogo = novoJogo();
  Array.from('*sabc').forEach(function (s) { jogo.processarSimbolo(s); });
  assert.equal(jogo.maquina.estado, 'qf');
  assert.equal(jogo.resultado, null);
  assert.equal(jogo.processarSimbolo('b').tipo, 'rejeitada');
});

test('reiniciar volta tudo à configuração inicial', function () {
  const jogo = novoJogo();
  ['*', 's', 'a'].forEach(function (s) { tocar(jogo, s); });
  jogo.reiniciar();
  assert.deepEqual(jogo.heroi, MAPA.inicio);
  assert.equal(jogo.fita, '');
  assert.equal(jogo.maquina.estado, 'q0');
  assert.equal(jogo.maquina.pilha, 'Z');
  assert.deepEqual(jogo.atravessados, {});
  assert.equal(jogo.resultado, null);
});
