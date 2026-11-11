/*
 * mapa.js — a grade do jogo (dados puros, sem DOM).
 *
 * O mapa NÃO define transições. Ele só diz:
 *   - quais tiles são chão e a que região (estado) cada um pertence;
 *   - onde fica o tile de cada evento e de qual região ele é acessível.
 * O destino de um evento vem sempre da δ em automato.js. tests/mapa.test.js
 * confere que as duas coisas concordam.
 *
 * Todos os tiles de evento são sólidos: nunca se pisa neles. Um evento só é
 * disparado por um toque na direção do tile, estando ao lado dele e dentro
 * da região a que o tile pertence. Visto de outra região, é parede.
 */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.MAPA = fabrica();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // # parede   ~ mar   . chão   @ início   o saída do portal   L lanterna
  // T árvore-chaveiro   * estrela   S passagem rúnica   B portão
  // G guardião   P ponte levadiça   U urna   C portal   ^ escada (λ)
  const GRADE = [
    '#########################',
    '#.......#...C...#.......#',
    '#.T.....B.......#...L...#',
    '#.......#.......#.......#',
    '####S#######P#######^####',
    '#.......#....G..#.......#',
    '#.T.....B.......#.o...U.#',
    '#.......#.......#.......#',
    '####*####################',
    '#.......#~~~~~~~~~~~~~~~~',
    '#.T...@.#~~~~~~~~~~~~~~~~',
    '#.......#~~~~~~~~~~~~~~~~',
    '#########~~~~~~~~~~~~~~~~'
  ];

  // Um tile de chão de cada região; a região inteira sai por preenchimento.
  const SEMENTES = {
    q0: { x: 6, y: 10 },
    q1: { x: 1, y: 5 },
    q2: { x: 1, y: 1 },
    q3: { x: 9, y: 5 },
    q4: { x: 9, y: 1 },
    q5: { x: 17, y: 5 },
    qf: { x: 17, y: 1 }
  };

  const CARACTERE = {
    arvore: 'T', estrela: '*', passagem: 'S', portao: 'B', guardiao: 'G',
    ponte: 'P', urna: 'U', portal: 'C', escada: '^'
  };

  // estado: região de onde o evento é acessível (= estado de origem na δ).
  // simbolo '' marca o tile da transição λ.
  // saida: só para o portal; nos demais a saída é o tile do outro lado.
  const EVENTOS = [
    { x: 2, y: 10, tipo: 'arvore', simbolo: 'a', estado: 'q0', nome: 'Árvore-chaveiro da Clareira', acao: 'colhe 1 chave' },
    { x: 4, y: 8, tipo: 'estrela', simbolo: '*', estado: 'q0', nome: 'Estrela caída', acao: 'guarda a estrela e sobe a colina' },
    { x: 2, y: 6, tipo: 'arvore', simbolo: 'a', estado: 'q1', nome: 'Árvore-chaveiro da Colina', acao: 'colhe 1 chave' },
    { x: 4, y: 4, tipo: 'passagem', simbolo: 's', estado: 'q1', nome: 'Passagem rúnica', acao: 'abre a passagem para a Gruta' },
    { x: 8, y: 6, tipo: 'portao', simbolo: 'b', estado: 'q1', nome: 'Portão da Ponte', acao: 'usa 1 chave e vai para a Ponte' },
    { x: 2, y: 2, tipo: 'arvore', simbolo: 'a', estado: 'q2', nome: 'Árvore-chaveiro da Gruta', acao: 'colhe 1 chave' },
    { x: 8, y: 2, tipo: 'portao', simbolo: 'b', estado: 'q2', nome: 'Porta da Gruta', acao: 'usa 1 chave e vai para o Pátio' },
    { x: 13, y: 5, tipo: 'guardiao', simbolo: 'b', estado: 'q3', nome: 'Guardião da ponte', acao: 'entrega 1 chave ao guardião' },
    { x: 12, y: 4, tipo: 'ponte', simbolo: 's', estado: 'q3', nome: 'Ponte levadiça', acao: 'baixa a ponte para o Pátio' },
    { x: 12, y: 1, tipo: 'portal', simbolo: 'c', estado: 'q4', nome: 'Portal', acao: 'entra no portal', saida: { x: 18, y: 6 } },
    { x: 22, y: 6, tipo: 'urna', simbolo: 'b', estado: 'q5', nome: 'Urna do farol', acao: 'deposita 1 chave' },
    { x: 20, y: 4, tipo: 'escada', simbolo: '', estado: 'q5', nome: 'Escada da lanterna', acao: 'sobe até a lanterna' }
  ];

  const VIZINHOS = [
    { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
  ];

  const altura = GRADE.length;
  const largura = GRADE[0].length;

  function chave(x, y) {
    return x + ',' + y;
  }

  function tile(x, y) {
    if (y < 0 || y >= altura || x < 0 || x >= GRADE[y].length) { return '#'; }
    return GRADE[y].charAt(x);
  }

  function caminhavel(x, y) {
    const c = tile(x, y);
    return c === '.' || c === '@' || c === 'o';
  }

  // Região de cada tile de chão, por preenchimento a partir das sementes.
  const regioes = {};
  const conflitos = [];
  Object.keys(SEMENTES).forEach(function (estado) {
    const fila = [SEMENTES[estado]];
    while (fila.length) {
      const p = fila.shift();
      const k = chave(p.x, p.y);
      if (!caminhavel(p.x, p.y)) { continue; }
      if (regioes[k]) {
        if (regioes[k] !== estado) { conflitos.push(k + ': ' + regioes[k] + ' e ' + estado); }
        continue;
      }
      regioes[k] = estado;
      VIZINHOS.forEach(function (v) { fila.push({ x: p.x + v.dx, y: p.y + v.dy }); });
    }
  });

  function regiaoDe(x, y) {
    return regioes[chave(x, y)] || null;
  }

  const porPosicao = {};
  EVENTOS.forEach(function (ev) { porPosicao[chave(ev.x, ev.y)] = ev; });

  function eventoEm(x, y) {
    return porPosicao[chave(x, y)] || null;
  }

  // O tile do evento "simbolo" acessível a partir da região "estado".
  function eventoDe(estado, simbolo) {
    for (let i = 0; i < EVENTOS.length; i++) {
      if (EVENTOS[i].estado === estado && EVENTOS[i].simbolo === simbolo) { return EVENTOS[i]; }
    }
    return null;
  }

  // Tiles de chão, dentro da região do evento, de onde se pode tocá-lo.
  // dx/dy é a direção do toque (do acesso para o evento).
  function acessos(ev) {
    const lista = [];
    VIZINHOS.forEach(function (v) {
      const x = ev.x - v.dx;
      const y = ev.y - v.dy;
      if (caminhavel(x, y) && regiaoDe(x, y) === ev.estado) {
        lista.push({ x: x, y: y, dx: v.dx, dy: v.dy });
      }
    });
    return lista;
  }

  // Onde o personagem sai ao atravessar o evento tocando-o a partir de "de".
  function saidaDe(ev, de) {
    if (ev.saida) { return { x: ev.saida.x, y: ev.saida.y }; }
    return { x: 2 * ev.x - de.x, y: 2 * ev.y - de.y };
  }

  // Menor caminho por chão entre dois pontos (busca em largura), incluindo os
  // extremos. null se não houver.
  function caminho(de, para) {
    const inicio = chave(de.x, de.y);
    const alvo = chave(para.x, para.y);
    const anterior = {};
    anterior[inicio] = null;
    const fila = [{ x: de.x, y: de.y }];
    while (fila.length) {
      const p = fila.shift();
      const k = chave(p.x, p.y);
      if (k === alvo) {
        const rota = [];
        let atual = p;
        while (atual) {
          rota.unshift({ x: atual.x, y: atual.y });
          atual = anterior[chave(atual.x, atual.y)];
        }
        return rota;
      }
      VIZINHOS.forEach(function (v) {
        const nx = p.x + v.dx;
        const ny = p.y + v.dy;
        const nk = chave(nx, ny);
        if (caminhavel(nx, ny) && !(nk in anterior)) {
          anterior[nk] = p;
          fila.push({ x: nx, y: ny });
        }
      });
    }
    return null;
  }

  // Caminho mais curto até um tile de onde se toca o evento.
  function caminhoAte(de, ev) {
    let melhor = null;
    acessos(ev).forEach(function (acesso) {
      const rota = caminho(de, acesso);
      if (rota && (!melhor || rota.length < melhor.caminho.length)) {
        melhor = { caminho: rota, acesso: acesso };
      }
    });
    return melhor;
  }

  // Tiles de chão de uma região (para a interface desenhar e rotular).
  function tilesDe(estado) {
    const lista = [];
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        if (regiaoDe(x, y) === estado) { lista.push({ x: x, y: y }); }
      }
    }
    return lista;
  }

  let inicio = null;
  for (let y = 0; y < altura && !inicio; y++) {
    const x = GRADE[y].indexOf('@');
    if (x !== -1) { inicio = { x: x, y: y }; }
  }

  return {
    GRADE: GRADE,
    SEMENTES: SEMENTES,
    CARACTERE: CARACTERE,
    EVENTOS: EVENTOS,
    VIZINHOS: VIZINHOS,
    largura: largura,
    altura: altura,
    inicio: inicio,
    conflitos: conflitos,
    tile: tile,
    caminhavel: caminhavel,
    regiaoDe: regiaoDe,
    eventoEm: eventoEm,
    eventoDe: eventoDe,
    acessos: acessos,
    saidaDe: saidaDe,
    caminho: caminho,
    caminhoAte: caminhoAte,
    tilesDe: tilesDe
  };
}));
