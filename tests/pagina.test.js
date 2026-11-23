/*
 * pagina.test.js — todo arquivo local referenciado pela página existe, com
 * exatamente as mesmas maiúsculas e minúsculas.
 *
 * O desenvolvimento é no Windows, que não diferencia "Img/" de "img/"; o
 * GitHub Pages roda em Linux e diferencia. Por isso cada pedaço do caminho é
 * conferido contra a listagem real do diretório, e não com fs.existsSync.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const IMAGEM = 'img/jflap-diagrama.png';

function existeComCaixaExata(relativo) {
  let dir = RAIZ;
  const partes = relativo.split('/');
  for (let i = 0; i < partes.length; i++) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { return false; }
    if (fs.readdirSync(dir).indexOf(partes[i]) === -1) { return false; }
    dir = path.join(dir, partes[i]);
  }
  return true;
}

function referenciasLocais(html) {
  const lista = [];
  const re = /\s(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const alvo = m[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(alvo)) { continue; }   // data:, https:, âncoras
    lista.push(alvo.split(/[?#]/)[0]);
  }
  return lista;
}

const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(RAIZ, 'README.md'), 'utf8');

test('todo src/href local do index.html existe com a caixa exata', function () {
  const refs = referenciasLocais(html);
  assert.ok(refs.length >= 8, 'esperava ao menos CSS, 6 scripts e o pda.jff; achei ' + refs.length);
  refs.forEach(function (ref) {
    assert.ok(existeComCaixaExata(ref), 'não existe (ou difere em maiúsculas/minúsculas): ' + ref);
    assert.doesNotMatch(ref, /^\//, 'caminho absoluto quebra em /Estrela-do-Farol-PDA/: ' + ref);
  });
});

test('a captura do JFLAP está no repositório, com nome só em minúsculas, e é referenciada com esse nome exato', function () {
  assert.ok(existeComCaixaExata(IMAGEM), IMAGEM + ' não encontrado com a caixa exata');
  assert.match(IMAGEM, /^[a-z0-9\/.-]+$/, 'só minúsculas, sem espaços nem acentos');

  const bytes = fs.readFileSync(path.join(RAIZ, IMAGEM));
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10], 'assinatura de PNG intacta');
  assert.ok(bytes.length < 500 * 1024, 'imagem com ' + bytes.length + ' bytes: otimize para menos de 500 KB');

  assert.ok(html.indexOf('<img src="' + IMAGEM + '"') !== -1, 'index.html não mostra a imagem');
  assert.ok(html.indexOf('<a href="' + IMAGEM + '"') !== -1, 'index.html não liga a imagem ao tamanho real');
  assert.ok(html.indexOf('<figcaption>Diagrama do autômato no JFLAP 7.1 (pda.jff)</figcaption>') !== -1, 'legenda da figura');
  assert.match(html, /<img src="img\/jflap-diagrama\.png"[^>]*\salt="[^"]{40,}"/, 'texto alternativo descritivo');
  assert.ok(readme.indexOf('](' + IMAGEM + ')') !== -1, 'README não mostra a imagem');

  // Nenhuma outra grafia do nome em lugar nenhum.
  [html, readme].forEach(function (texto) {
    (texto.match(/jflap-diagrama\.png/gi) || []).forEach(function (achado) {
      assert.equal(achado, 'jflap-diagrama.png');
    });
    (texto.match(/[A-Za-z]+\/jflap-diagrama\.png/g) || []).forEach(function (achado) {
      assert.equal(achado, IMAGEM);
    });
  });
});

test('CSS e scripts levam o mesmo ?v= (troque a cada publicação para o navegador não misturar versões)', function () {
  const re = /<(?:link[^>]*\shref|script[^>]*\ssrc)="((?:css|js)\/[^"]+)"/g;
  const versoes = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const v = /\?v=([A-Za-z0-9._-]+)$/.exec(m[1]);
    assert.ok(v, 'sem ?v=: ' + m[1]);
    versoes.push(v[1]);
  }
  assert.equal(versoes.length, 7, 'style.css e os 6 scripts');
  assert.equal(new Set(versoes).size, 1, 'versões diferentes: ' + versoes.join(', '));
});

/* ---------- nada alarga a página (regressões do teste em massa) ---------- */

test('B1: toda tabela da página fica dentro de uma área com rolagem própria', function () {
  const re = /<table\b/g;
  let m;
  let tabelas = 0;
  while ((m = re.exec(html)) !== null) {
    tabelas++;
    const antes = html.slice(0, m.index).replace(/\s+$/, '');
    assert.match(antes, /<div[^>]*class="[^"]*rolagem[^"]*"[^>]*>$/,
      'tabela fora de uma div de rolagem, perto de: ' + html.slice(m.index, m.index + 60));
  }
  assert.equal(tabelas, 5, 'histórico, tabela δ e as três da legenda');
});

test('B2: o aviso quebra cadeias longas sem espaço em vez de alargar a página', function () {
  const css = fs.readFileSync(path.join(RAIZ, 'css', 'style.css'), 'utf8');
  const regra = /\n\.aviso\s*\{([^}]*)\}/.exec(css);
  assert.ok(regra, 'regra .aviso não encontrada');
  assert.match(regra[1], /overflow-wrap:\s*anywhere/);
  // As áreas de rolagem das tabelas continuam com rolagem horizontal própria.
  assert.match(css, /\.tabela-rolagem\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.historico-rolagem\s*\{[^}]*overflow:\s*auto/);
});

test('B9: a faixa compacta pode encolher, e a pilha longa é cortada em vez de alargar a página', function () {
  const css = fs.readFileSync(path.join(RAIZ, 'css', 'style.css'), 'utf8');
  const faixa = /\n\s*\.faixa\s*\{([^}]*position:\s*sticky[^}]*)\}/.exec(css);
  assert.ok(faixa, 'regra da faixa fixa não encontrada');
  assert.match(faixa[1], /min-width:\s*0/, 'a faixa é item de grid: precisa de min-width: 0');
  const item = /\n\s*\.faixa-item\s*\{([^}]*)\}/.exec(css);
  assert.match(item[1], /min-width:\s*0/);
  const pilha = /\n\s*\.faixa-pilha\s*\{([^}]*)\}/.exec(css);
  assert.match(pilha[1], /min-width:\s*0/);
  assert.match(pilha[1], /overflow:\s*hidden/);
  assert.match(pilha[1], /text-overflow:\s*ellipsis/);
  assert.match(pilha[1], /white-space:\s*nowrap/);
});
