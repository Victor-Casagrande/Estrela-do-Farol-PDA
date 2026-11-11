/*
 * main.test.js — regressões dos fluxos de js/main.js (teclado, botões, roteiro).
 *
 * main.js é um script de página: usa document, window, setTimeout e a
 * interface (UI). Para testá-lo sem navegador e sem refatorá-lo, o arquivo é
 * executado como está dentro de um contexto do módulo vm com:
 *   - um DOM mínimo de mentira (só o que main.js toca diretamente);
 *   - uma UI de mentira que apenas registra as chamadas recebidas;
 *   - um relógio virtual (setTimeout e Date.now), para as animações não
 *     custarem tempo de verdade.
 * O autômato, o motor, o mapa e o jogo são os de verdade.
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
const JOGO = require('../js/game.js');

const CODIGO = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function microtarefas() {
  return new Promise(function (resolver) { setImmediate(resolver); });
}

function montar() {
  /* ---------- relógio virtual ---------- */
  let agora = 0;
  let sequencia = 0;
  const timers = [];

  async function avancar(ms) {
    const fim = agora + ms;
    for (;;) {
      await microtarefas();
      timers.sort(function (a, b) { return a.quando - b.quando || a.ordem - b.ordem; });
      if (!timers.length || timers[0].quando > fim) { break; }
      const t = timers.shift();
      agora = t.quando;
      t.f();
    }
    agora = fim;
    await microtarefas();
  }

  /* ---------- DOM mínimo ---------- */
  const documento = { activeElement: null };

  function Elemento(nome) {
    this.nome = nome;
    this.tagName = 'DIV';
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this.pai = null;
    this.atributos = {};
    this.ouvintes = {};
  }
  Elemento.prototype.addEventListener = function (tipo, f) {
    (this.ouvintes[tipo] = this.ouvintes[tipo] || []).push(f);
  };
  // Dispara os ouvintes mesmo com o elemento desabilitado: serve para provar
  // que o próprio ouvinte recusa a ação.
  Elemento.prototype.disparar = function (tipo, evento) {
    (this.ouvintes[tipo] || []).forEach(function (f) { f(evento || {}); });
  };
  // Como no navegador: botão desabilitado não recebe clique.
  Elemento.prototype.click = function () {
    if (!this.disabled) { this.disparar('click', {}); }
  };
  Elemento.prototype.focus = function () { documento.activeElement = this; };
  Elemento.prototype.getAttribute = function (nome) { return this.atributos[nome]; };
  Elemento.prototype.contains = function (outro) { return outro === this || Boolean(outro && outro.pai === this); };
  Elemento.prototype.getBoundingClientRect = function () { return { top: 0 }; };
  Elemento.prototype.scrollIntoView = function () {};

  const porId = {};
  documento.getElementById = function (id) {
    return porId[id] || (porId[id] = new Elemento('#' + id));
  };

  const dpad = new Elemento('.dpad');
  const direcional = [[0, -1], [-1, 0], [0, 1], [1, 0]].map(function (d) {
    const b = new Elemento('.dpad button');
    b.tagName = 'BUTTON';
    b.pai = dpad;
    b.atributos['data-dx'] = String(d[0]);
    b.atributos['data-dy'] = String(d[1]);
    return b;
  });
  const cartaoMapa = new Elemento('.cartao-mapa');
  documento.querySelector = function (seletor) {
    if (seletor === '.dpad') { return dpad; }
    if (seletor === '.cartao-mapa') { return cartaoMapa; }
    return null;
  };
  documento.querySelectorAll = function (seletor) {
    return seletor === '.dpad button' ? direcional : [];
  };

  const ouvintesDaJanela = {};
  const janela = {
    innerHeight: 800,
    addEventListener: function (tipo, f) { (ouvintesDaJanela[tipo] = ouvintesDaJanela[tipo] || []).push(f); }
  };

  /* ---------- UI de mentira: registra tudo o que main.js manda mostrar ---------- */
  const chamadas = [];
  const falhar = {};   // nome do método -> quantas vezes ainda deve lançar
  let aoEscolherExemplo = null;
  const ui = new Proxy({}, {
    get: function (alvo, nome) {
      if (!alvo[nome]) {
        alvo[nome] = function () {
          const args = Array.prototype.slice.call(arguments);
          chamadas.push({ nome: nome, args: args });
          if (nome === 'exemplos') { aoEscolherExemplo = args[0]; }
          if (falhar[nome] > 0) {
            falhar[nome]--;
            throw new Error('falha simulada em ui.' + nome);
          }
        };
      }
      return alvo[nome];
    }
  });

  const errosNoConsole = [];
  const contexto = vm.createContext({
    AUTOMATO: M, PDA: PDA, MAPA: MAPA, JOGO: JOGO,
    UI: { criar: function () { return ui; } },
    document: documento,
    window: janela,
    setTimeout: function (f, ms) { timers.push({ quando: agora + (ms || 0), ordem: sequencia++, f: f }); },
    Date: { now: function () { return agora; } },
    console: { error: function (e) { errosNoConsole.push(e); } }
  });
  vm.runInContext(CODIGO, contexto, { filename: 'js/main.js' });

  function ultima(nome) {
    for (let i = chamadas.length - 1; i >= 0; i--) {
      if (chamadas[i].nome === nome) { return chamadas[i].args; }
    }
    return null;
  }

  function contar(nome) {
    return chamadas.filter(function (c) { return c.nome === nome; }).length;
  }

  // Simula uma tecla. Devolve true se main.js chamou preventDefault.
  function tecla(key, opcoes) {
    opcoes = opcoes || {};
    let evitou = false;
    const evento = {
      key: key,
      repeat: Boolean(opcoes.repeat),
      ctrlKey: false, metaKey: false, altKey: false,
      target: opcoes.alvo || documento.activeElement || new Elemento('body'),
      preventDefault: function () { evitou = true; }
    };
    (ouvintesDaJanela.keydown || []).forEach(function (f) { f(evento); });
    return evitou;
  }

  return {
    avancar: avancar,
    documento: documento,
    el: documento.getElementById,
    direcional: direcional,
    chamadas: chamadas,
    falhar: falhar,
    errosNoConsole: errosNoConsole,
    ultima: ultima,
    contar: contar,
    tecla: tecla,
    escolherExemplo: function (i) { aoEscolherExemplo(M.exemplos[i]); },
    // Veredito mostrado no painel: null enquanto está "EM ANDAMENTO".
    veredito: function () { const r = ultima('resultado'); return r ? r[0] : undefined; },
    estado: function () { return ultima('estado')[0]; }
  };
}

// Da posição inicial até encostar na estrela: A, A, W; o próximo W é o toque.
async function irAteAEstrela(p) {
  ['a', 'a', 'w'].forEach(function (k) { p.tecla(k); });
  await p.avancar(50);
}

/* ---------- J-01: "Encerrar percurso" não vale durante um roteiro ---------- */

test('J-01: no Passo a passo, "Encerrar percurso" fica desabilitado e é ignorado', async function () {
  const p = montar();
  const encerrar = p.el('btn-encerrar');
  const passo = p.el('btn-passo');
  assert.equal(encerrar.disabled, false, 'no modo WASD o botão começa habilitado');

  p.el('roteiro').value = '*sabcb';
  for (let i = 0; i < 5; i++) {
    passo.click();
    await p.avancar(5000);
    assert.equal(encerrar.disabled, true, 'desabilitado depois do passo ' + (i + 1));
  }
  // Leu "*sabc" e parou em qf com um "b" ainda na fita: o caso do relatório.
  assert.equal(p.estado(), 'qf');
  assert.equal(p.veredito(), null, 'ainda em andamento');

  // Mesmo forçando o clique (como um script faria), nada é decidido.
  encerrar.disparar('click');
  await p.avancar(100);
  assert.equal(p.veredito(), null, 'o clique forçado não pode encerrar um prefixo do roteiro');
  assert.equal(p.estado(), 'qf');

  // O roteiro segue e chega ao resultado certo: "*sabcb" é REJEITADA.
  passo.click();
  await p.avancar(5000);
  assert.equal(p.veredito().aceita, false);
  assert.match(p.veredito().motivo, /δ\(qf, b, pilha vazia\) indefinida/);
  assert.equal(PDA.executar(M, '*sabcb').aceita, false);
});

test('J-01: durante o Executar, "Encerrar percurso" também é ignorado e o resultado é o da cadeia inteira', async function () {
  const p = montar();
  const encerrar = p.el('btn-encerrar');
  p.el('roteiro').value = '*sabc';
  p.el('btn-executar').click();

  // Tenta encerrar em vários instantes: no meio de uma animação e nos intervalos.
  for (let i = 0; i < 12; i++) {
    await p.avancar(190);
    if (p.veredito()) { break; }
    assert.equal(encerrar.disabled, true, 'desabilitado aos ' + ((i + 1) * 190) + ' ms');
    encerrar.disparar('click');
    assert.equal(p.veredito(), null, 'encerrou antes da hora aos ' + ((i + 1) * 190) + ' ms');
  }

  await p.avancar(30000);
  assert.equal(p.veredito().aceita, true, '"*sabc" é ACEITA');
  assert.equal(p.estado(), 'qf');
});

test('J-01: no modo WASD o "Encerrar percurso" continua funcionando', async function () {
  const p = montar();
  await irAteAEstrela(p);
  p.tecla('w');
  await p.avancar(2000);
  assert.equal(p.estado(), 'q1');
  assert.equal(p.el('btn-encerrar').disabled, false);

  p.el('btn-encerrar').click();
  await p.avancar(100);
  assert.equal(p.veredito().aceita, false);
  assert.equal(p.veredito().tipo, 'fora-de-F');
  assert.equal(p.el('btn-encerrar').disabled, true, 'depois de encerrado não há o que encerrar');
});

/* ---------- J-03: o painel acompanha cada ato da animação ---------- */

test('J-03: o texto "em andamento" fala do estado de cada passo, inclusive entre o portal e a λ', async function () {
  const p = montar();
  p.el('roteiro').value = '*sabc';
  p.el('btn-executar').click();
  await p.avancar(30000);

  // Para cada passo válido: logo depois de ui.estado(q), o texto neutro cita q.
  let conferidos = 0;
  p.chamadas.forEach(function (c, i) {
    if (c.nome !== 'historicoLinha' || !c.args[0].ok) { return; }
    const registro = c.args[0];
    const seguinte = p.chamadas.slice(i + 1).filter(function (d) { return d.nome === 'resultado'; })[0];
    assert.ok(seguinte, 'nenhum texto de resultado depois do passo ' + registro.passo);
    if (seguinte.args[0] === null) {
      assert.match(seguinte.args[1], new RegExp('Estado atual ' + registro.estado + ' '), 'passo ' + registro.passo);
      conferidos++;
    }
  });
  assert.equal(conferidos, 6, 'os 5 símbolos e a λ atualizam o texto');

  // Em nenhum momento o texto cita um estado diferente do último exibido.
  let exibido = 'q0';
  p.chamadas.forEach(function (c) {
    if (c.nome === 'estado') { exibido = c.args[0]; }
    if (c.nome === 'resultado' && c.args[0] === null) {
      assert.match(c.args[1], new RegExp('Estado atual ' + exibido + ' '));
    }
  });
});

/* ---------- J-04: as setas só são do jogo com o foco no mapa ---------- */

test('J-04: setas movem e evitam a rolagem só com foco no mapa e percurso WASD ativo', async function () {
  const p = montar();
  const mapa = p.el('mapa');
  const fora = p.el('btn-executar');
  assert.equal(p.documento.activeElement, mapa, 'o mapa recebe o foco ao carregar');

  let antes = p.contar('heroi');
  assert.equal(p.tecla('ArrowLeft'), true, 'foco no mapa: preventDefault');
  assert.equal(p.contar('heroi'), antes + 1, 'foco no mapa: a personagem anda');

  // Foco no direcional também conta como mapa.
  p.direcional[0].focus();
  antes = p.contar('heroi');
  assert.equal(p.tecla('ArrowLeft'), true);
  assert.equal(p.contar('heroi'), antes + 1);

  // Foco fora do mapa: a seta é do navegador (rola a página) e não move.
  fora.focus();
  antes = p.contar('heroi');
  assert.equal(p.tecla('ArrowDown'), false, 'foco fora do mapa: sem preventDefault');
  assert.equal(p.contar('heroi'), antes, 'foco fora do mapa: a seta não move');

  // As letras continuam movendo em qualquer foco, sem interferir no navegador.
  assert.equal(p.tecla('a'), false);
  assert.equal(p.contar('heroi'), antes + 1, 'W A S D valem com o foco em um botão');

  // Dentro de um campo de texto nada chega ao jogo.
  const campo = p.el('roteiro');
  campo.tagName = 'INPUT';
  campo.focus();
  antes = p.contar('heroi');
  assert.equal(p.tecla('a'), false);
  assert.equal(p.tecla('ArrowLeft'), false);
  assert.equal(p.contar('heroi'), antes);
});

test('J-04: com o percurso encerrado ou um roteiro em andamento, as setas voltam a rolar a página', async function () {
  const p = montar();
  const mapa = p.el('mapa');

  p.el('btn-encerrar').click();
  await p.avancar(100);
  mapa.focus();
  let antes = p.contar('heroi');
  assert.equal(p.tecla('ArrowDown'), false, 'percurso encerrado: sem preventDefault');
  assert.equal(p.contar('heroi'), antes);

  p.el('btn-reiniciar').click();
  assert.equal(p.documento.activeElement, mapa, 'o Reiniciar do mapa devolve o foco ao mapa');
  assert.equal(p.tecla('ArrowLeft'), true, 'depois de reiniciar as setas voltam a ser do jogo');

  p.el('roteiro').value = '*sabc';
  p.el('btn-passo').click();
  await p.avancar(5000);
  mapa.focus();
  antes = p.contar('heroi');
  assert.equal(p.tecla('ArrowDown'), false, 'roteiro em andamento: sem preventDefault');
  assert.equal(p.contar('heroi'), antes);
});

/* ---------- J-05: "Passo a passo" trava no fim do roteiro ---------- */

test('J-05: depois do resultado, "Passo a passo" só volta com Reiniciar ou ao editar a cadeia', async function () {
  const p = montar();
  const passo = p.el('btn-passo');
  const campo = p.el('roteiro');
  campo.value = '*b';

  passo.click();
  await p.avancar(5000);
  assert.equal(passo.disabled, false, 'no meio do roteiro continua habilitado');
  passo.click();
  await p.avancar(5000);
  assert.equal(p.veredito().aceita, false);
  assert.equal(passo.disabled, true, 'desabilitado depois de REJEITADA');

  // O clique a mais do relatório: não reinicia nem apaga o resultado.
  const linhas = p.contar('historicoLimpar');
  passo.click();
  await p.avancar(5000);
  assert.equal(p.contar('historicoLimpar'), linhas, 'o roteiro não recomeçou');
  assert.equal(p.veredito().aceita, false, 'o resultado continua na tela');

  campo.value = '*sabc';
  campo.disparar('input');
  assert.equal(passo.disabled, false, 'editar a cadeia libera o botão');

  for (let i = 0; i < 5; i++) { passo.click(); await p.avancar(5000); }
  assert.equal(p.veredito().aceita, true);
  assert.equal(passo.disabled, true, 'desabilitado depois de ACEITA');

  p.el('btn-reiniciar-roteiro').click();
  assert.equal(passo.disabled, false, 'Reiniciar libera o botão');
});

test('J-05: resultado obtido em WASD não trava o "Passo a passo"', async function () {
  const p = montar();
  p.el('btn-encerrar').click();
  await p.avancar(100);
  assert.equal(p.veredito().aceita, false);
  assert.equal(p.el('btn-passo').disabled, false);
});

/* ---------- E-01: uma exceção na animação não trava o teclado ---------- */

test('E-01: se a interface falhar no meio de uma animação, o teclado continua respondendo', async function () {
  const p = montar();
  await irAteAEstrela(p);

  p.falhar.heroi = 1;          // a próxima chamada a ui.heroi lança
  p.tecla('w');                // toca a estrela: travessia animada
  await p.avancar(2000);
  assert.equal(p.errosNoConsole.length, 1, 'a falha foi registrada, não engolida');
  assert.match(String(p.errosNoConsole[0].message), /falha simulada em ui\.heroi/);
  assert.equal(p.estado(), 'q1', 'a tela foi ressincronizada com o autômato');
  assert.match(p.ultima('aviso')[0], /Algo falhou ao animar/);

  // O teclado não ficou travado: a personagem anda e o jogo segue até aceitar.
  const antes = p.contar('heroi');
  p.tecla('d');
  await p.avancar(50);
  assert.equal(p.contar('heroi'), antes + 1, 'a tecla seguinte moveu a personagem');
  ['a', 'w', 'w'].forEach(function (k) { p.tecla(k); });   // até encostar na passagem rúnica
  p.tecla('w');                                            // o toque: q1 -> q2
  await p.avancar(2000);
  assert.equal(p.estado(), 'q2');
});

test('E-01: a mesma falha durante um roteiro não impede de continuar o Passo a passo', async function () {
  const p = montar();
  const passo = p.el('btn-passo');
  p.el('roteiro').value = '*sabc';

  passo.click();               // "*": sem falha
  await p.avancar(5000);
  assert.equal(p.estado(), 'q1');

  p.falhar.heroi = 1;
  passo.click();               // "s": a caminhada até a passagem lança em ui.heroi
  await p.avancar(5000);
  assert.equal(p.errosNoConsole.length, 1);
  assert.equal(p.estado(), 'q2', 'o símbolo foi processado e a tela ressincronizada');

  for (let i = 0; i < 4 && !p.veredito(); i++) { passo.click(); await p.avancar(5000); }
  assert.equal(p.veredito().aceita, true, 'o roteiro chega ao fim mesmo depois da falha');
  assert.equal(p.estado(), 'qf');
});
