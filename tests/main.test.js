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

/* ---------- marcas do mapa durante a animação ---------- */

test('marcas do mapa: somem no início da animação de um passo e voltam com a configuração nova', async function () {
  function vazio(args) { return Object.keys(args[0] || {}).length === 0; }

  // WASD: o toque na estrela.
  const p = montar();
  await irAteAEstrela(p);
  assert.equal(vazio(p.ultima('situacaoEventos')), false, 'antes do toque a estrela e a árvore têm marca');
  const inicio = p.chamadas.length;
  p.tecla('w');
  await p.avancar(2000);
  const passo = p.chamadas.slice(inicio);
  const nomes = passo.map(function (c) { return c.nome; });
  const limpou = nomes.indexOf('situacaoEventos');
  assert.ok(limpou >= 0 && vazio(passo[limpou].args), 'a primeira chamada do passo limpa as marcas');
  assert.ok(limpou < nomes.indexOf('heroi') && limpou < nomes.indexOf('historicoLinha'), 'antes de animar');
  passo.slice(limpou + 1, nomes.lastIndexOf('historicoLinha') + 1).forEach(function (c) {
    if (c.nome === 'situacaoEventos') { assert.ok(vazio(c.args), 'nenhuma marca durante a animação'); }
  });
  assert.equal(p.estado(), 'q1');
  assert.deepEqual(Object.keys(p.ultima('situacaoEventos')[0]).sort(),
    MAPA.EVENTOS.filter(function (e) { return e.estado === 'q1' && e.simbolo !== ''; })
      .map(function (e) { return e.x + ',' + e.y; }).sort(),
    'no fim, as marcas são as da Colina');

  // Roteiro: cada símbolo limpa antes de animar.
  const r = montar();
  r.el('roteiro').value = '*s';
  r.el('btn-executar').click();
  await r.avancar(10000);
  let marcas = null;
  r.chamadas.forEach(function (c) {
    if (c.nome === 'situacaoEventos') { marcas = c.args[0]; }
    if (c.nome === 'historicoLinha') {
      assert.equal(Object.keys(marcas || {}).length, 0, 'passo ' + c.args[0].passo + ' animado sem marcas');
    }
  });
});

/* ---------- reação da personagem (M8) ---------- */

test('Lia vira para o lado da tecla e pula ao colher, mas não ao atravessar', async function () {
  const p = montar();
  p.tecla('a');                       // anda para a esquerda
  await p.avancar(50);
  assert.deepEqual(p.ultima('olhar'), [-1]);
  p.tecla('a');
  p.tecla('a');                       // encosta na árvore (x = 3)
  await p.avancar(50);
  const antes = p.contar('pular');
  p.tecla('a');                       // toque: colhe uma chave, não sai do lugar
  await p.avancar(2000);
  assert.equal(p.contar('pular'), antes + 1, 'colher dá um pulinho');

  p.tecla('d');
  await p.avancar(50);
  assert.deepEqual(p.ultima('olhar'), [1], 'virou para a direita');
  p.tecla('w');
  await p.avancar(50);
  const antesDaEstrela = p.contar('pular');
  p.tecla('w');                       // toque na estrela: atravessa para a Colina
  await p.avancar(2000);
  assert.equal(p.estado(), 'q1');
  assert.equal(p.contar('pular'), antesDaEstrela, 'travessia não pula');
});

test('E-01: se limpar as marcas do mapa falhar no início da animação, o teclado continua respondendo', async function () {
  const p = montar();
  await irAteAEstrela(p);

  p.falhar.situacaoEventos = 1;   // a próxima chamada a ui.situacaoEventos lança
  p.tecla('w');                   // toca a estrela: tocar() começa limpando as marcas
  await p.avancar(2000);
  assert.equal(p.errosNoConsole.length, 1, 'a falha foi registrada, não engolida');
  assert.match(String(p.errosNoConsole[0].message), /falha simulada em ui\.situacaoEventos/);
  assert.equal(p.estado(), 'q1', 'a tela foi ressincronizada com o autômato');

  const antes = p.contar('heroi');
  p.tecla('d');
  await p.avancar(50);
  assert.equal(p.contar('heroi'), antes + 1, 'a tecla seguinte moveu a personagem');
});

/* ---------- regressões do teste em massa (fuzzing) de 23/11 ---------- */

test('B4: depois de editar a cadeia, "Passo a passo" continua habilitado mesmo trocando de modo', async function () {
  const p = montar();
  const passo = p.el('btn-passo');
  const campo = p.el('roteiro');
  campo.value = '';
  p.el('btn-executar').click();
  await p.avancar(1000);
  assert.equal(p.veredito().aceita, false);
  assert.equal(passo.disabled, true, 'desabilitado depois de REJEITADA');

  // Trocar de modo sem editar não libera nada.
  p.el('modo-estrito').click();
  assert.equal(passo.disabled, true, 'trocar de modo sozinho não habilita');

  campo.value = '*absc';
  campo.disparar('input');
  assert.equal(passo.disabled, false, 'editar habilita');
  p.el('modo-jogo').click();
  assert.equal(passo.disabled, false, 'Modo Jogo não desabilita de novo');
  p.el('modo-estrito').click();
  assert.equal(passo.disabled, false, 'Modo Estrito não desabilita de novo');

  // O botão liberado roda a cadeia nova até o fim, e aí trava outra vez.
  for (let i = 0; i < 5; i++) { passo.click(); await p.avancar(5000); }
  assert.equal(p.veredito().aceita, true, '"*absc" é ACEITA');
  assert.equal(passo.disabled, true, 'travado de novo depois do resultado novo');
  p.el('modo-jogo').click();
  assert.equal(passo.disabled, true, 'a edição antiga não vale para o resultado novo');
});

test('B5: uma falha de desenho no meio do roteiro não pula símbolo nem muda o veredito', async function () {
  // Falha em ui.fita no instante em que cada símbolo de "a*aabbscb" começa.
  for (let alvo = 0; alvo < 9; alvo++) {
    const p = montar();
    const passo = p.el('btn-passo');
    p.el('roteiro').value = 'a*aabbscb';
    for (let i = 0; i < alvo; i++) { passo.click(); await p.avancar(5000); }
    p.falhar.fita = 1;
    passo.click();
    await p.avancar(5000);
    assert.equal(p.errosNoConsole.length, 1, 'falha registrada (símbolo ' + alvo + ')');
    for (let i = 0; i < 12 && !p.veredito(); i++) { passo.click(); await p.avancar(5000); }
    assert.ok(p.veredito(), 'sem veredito (símbolo ' + alvo + ')');
    assert.equal(p.veredito().aceita, true, 'falha no símbolo ' + alvo + ': ' + p.veredito().motivo);
    assert.equal(p.ultima('fita')[0].lidos, 9, 'os 9 símbolos foram lidos (símbolo ' + alvo + ')');
  }

  // O caso do relatório: exemplo "Rota da Ponte" no Executar, falha aos 350 ms.
  const p = montar();
  p.escolherExemplo(1);
  p.falhar.fita = 1;
  await p.avancar(573);
  for (let i = 0; i < 12 && !p.veredito(); i++) { p.el('btn-passo').click(); await p.avancar(5000); }
  assert.equal(p.veredito().aceita, true, 'a*aabbscb continua ACEITA: ' + p.veredito().motivo);
});

test('B6: a ressincronização apaga do mapa um veredito que o motor não tem mais', async function () {
  const p = montar();
  p.el('btn-encerrar').click();
  await p.avancar(100);
  assert.equal(p.ultima('fim')[0].aceita, false, 'pré-condição: REJEITADA sobre o mapa');

  p.falhar.pilha = 1;                 // falha dentro do reinício do roteiro
  p.el('roteiro').value = '*sabc';
  p.el('btn-passo').click();
  await p.avancar(5000);
  assert.equal(p.errosNoConsole.length, 1);
  assert.equal(p.veredito(), null, 'o painel está em andamento');
  assert.equal(p.ultima('fim')[0], null, 'o mapa não pode continuar mostrando o veredito antigo');
  assert.equal(p.estado(), 'q0');

  // E o roteiro roda normalmente no clique seguinte.
  for (let i = 0; i < 5; i++) { p.el('btn-passo').click(); await p.avancar(5000); }
  assert.equal(p.veredito().aceita, true);
  assert.equal(p.ultima('fim')[0].aceita, true);
});

test('B7: uma falha de desenho num toque em WASD não perde o símbolo da fita nem o histórico', async function () {
  for (const metodo of ['olhar', 'fita', 'dicas', 'processando', 'historicoLinha']) {
    const p = montar();
    await irAteAEstrela(p);
    p.falhar[metodo] = 1;
    p.tecla('w');                     // toca a estrela
    await p.avancar(2000);
    assert.equal(p.errosNoConsole.length, 1, 'falha em ui.' + metodo + ' registrada');
    assert.equal(p.estado(), 'q1', 'ui.' + metodo + ': a estrela foi consumida');

    const fita = p.ultima('fita')[0];
    assert.equal(fita.simbolos.join(''), '*', 'ui.' + metodo + ': a fita mostra o símbolo consumido');
    assert.equal(fita.lidos, 1, 'ui.' + metodo);
    assert.equal(p.el('btn-enviar').disabled, false, 'ui.' + metodo + ': Enviar percurso habilitado');

    // O histórico é refeito inteiro a partir do motor.
    let desdeOLimpar = [];
    p.chamadas.forEach(function (c) {
      if (c.nome === 'historicoLimpar') { desdeOLimpar = []; }
      if (c.nome === 'historicoLinha') { desdeOLimpar.push(c.args[0].estado); }
    });
    assert.deepEqual(desdeOLimpar, ['q1'], 'ui.' + metodo + ': histórico com a linha do "*"');

    // O percurso segue e pode ser enviado ao roteiro.
    p.el('btn-enviar').click();
    assert.equal(p.el('roteiro').value, '*', 'ui.' + metodo);
  }
});

test('B7: a mesma falha num símbolo que rejeita deixa a rejeição marcada na fita', async function () {
  const p = montar();
  p.el('modo-estrito').click();
  await irAteAEstrela(p);
  p.tecla('w');
  await p.avancar(2000);
  ['d', 'd', 'd', 'w'].forEach(function (k) { p.tecla(k); });   // até encostar no portão da Ponte
  await p.avancar(50);
  p.falhar.fita = 1;
  p.tecla('d');                       // Modo Estrito, sem chave: REJEITADA
  await p.avancar(2000);
  assert.equal(p.errosNoConsole.length, 1);
  assert.equal(p.veredito().aceita, false);
  const fita = p.ultima('fita')[0];
  assert.equal(fita.simbolos.join(''), '*b');
  assert.equal(fita.erro, 1, 'o símbolo rejeitado fica marcado');
  assert.equal(fita.encerrada, true);
});

test('B8: uma falha da interface não escapa dos cliques em Reiniciar, Encerrar, Enviar e nos modos', async function () {
  const casos = [
    { botao: 'btn-reiniciar', falha: 'fita' },
    { botao: 'btn-reiniciar-roteiro', falha: 'pilha' },
    { botao: 'btn-encerrar', falha: 'resultado' },
    { botao: 'modo-estrito', falha: 'modo' },
    { botao: 'modo-jogo', falha: 'modo' },
    { botao: 'btn-enviar', falha: 'aviso', antes: async function (p) { await irAteAEstrela(p); p.tecla('w'); await p.avancar(2000); } }
  ];
  for (const caso of casos) {
    const p = montar();
    if (caso.antes) { await caso.antes(p); }
    p.falhar[caso.falha] = 1;
    assert.doesNotThrow(function () { p.el(caso.botao).click(); }, caso.botao + ': a exceção escapou do clique');
    await p.avancar(100);
    assert.equal(p.errosNoConsole.length, 1, caso.botao + ': a falha foi registrada');
    assert.match(String(p.errosNoConsole[0].message), new RegExp('falha simulada em ui\\.' + caso.falha), caso.botao);

    // A tela foi refeita e o jogo continua utilizável.
    p.el('btn-reiniciar').click();
    await p.avancar(100);
    assert.equal(p.estado(), 'q0', caso.botao);
    assert.equal(p.veredito(), null, caso.botao);
    assert.equal(p.ultima('fim')[0], null, caso.botao);
    const antes = p.contar('heroi');
    p.tecla('a');
    await p.avancar(50);
    assert.equal(p.contar('heroi'), antes + 1, caso.botao + ': o teclado responde');
  }
});

test('B8: o modo mostrado volta a bater com o modo do jogo depois de uma falha ao trocá-lo', async function () {
  const p = montar();
  p.falhar.modo = 1;
  p.el('modo-estrito').click();
  await p.avancar(100);
  assert.equal(p.ultima('modo')[0], true, 'a tela refeita mostra o Modo Estrito, que é o do jogo');
});

test('B4: uma edição feita no meio do roteiro não deixa o "Passo a passo" liberado quando o resultado chega', async function () {
  const p = montar();
  const passo = p.el('btn-passo');
  const campo = p.el('roteiro');
  campo.value = '*sabc';
  p.el('btn-executar').click();
  await p.avancar(900);
  assert.equal(p.veredito(), null, 'ainda no meio do roteiro');
  campo.disparar('input');            // mexeu no campo durante a execução
  await p.avancar(30000);
  assert.equal(p.veredito().aceita, true);
  assert.equal(passo.disabled, true, 'travado: a edição foi antes do resultado');
  p.el('modo-estrito').click();
  assert.equal(passo.disabled, true);
  campo.disparar('input');            // agora sim, depois do resultado
  assert.equal(passo.disabled, false);
  p.el('modo-jogo').click();
  assert.equal(passo.disabled, false);
});
