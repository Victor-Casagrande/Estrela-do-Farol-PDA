/*
 * ui.js — tudo o que é desenhado na página: mapa, painel do autômato (estado,
 * símbolo, pilha, fita, resultado), histórico, diagrama SVG, tabela δ e
 * legendas. Não toma decisões de jogo: só mostra o que main.js manda.
 *
 * O diagrama e a tabela são construídos a partir de AUTOMATO.delta, a mesma
 * estrutura usada pelo motor.
 */
(function (raiz) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const RAIO = 26;

  // Tipos de tile que ficam dentro da sala; os demais ocupam um vão na parede.
  const DENTRO_DA_SALA = { arvore: true, guardiao: true, urna: true, portal: true };
  const ICONE_DE_PILHA = { K: 'chave', E: 'estrela', Z: 'fundo' };

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, atributos, filhos) {
    const no = document.createElement(tag);
    Object.keys(atributos || {}).forEach(function (k) {
      if (k === 'texto') { no.textContent = atributos[k]; }
      else if (k === 'classe') { no.className = atributos[k]; }
      else { no.setAttribute(k, atributos[k]); }
    });
    (filhos || []).forEach(function (f) {
      no.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
    });
    return no;
  }

  function svg(tag, atributos, filhos) {
    const no = document.createElementNS(NS, tag);
    Object.keys(atributos || {}).forEach(function (k) {
      if (k === 'texto') { no.textContent = atributos[k]; }
      else if (k === 'classe') { no.setAttribute('class', atributos[k]); }
      else { no.setAttribute(k, atributos[k]); }
    });
    (filhos || []).forEach(function (f) { no.appendChild(f); });
    return no;
  }

  function icone(nome, classe) {
    return svg('svg', { classe: classe || 'icone', viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false' }, [
      svg('use', { href: '#i-' + nome })
    ]);
  }

  function criar(opcoes) {
    const M = opcoes.M;
    const mapa = opcoes.mapa;
    const PDA = opcoes.PDA;

    const estadoPor = {};
    M.estados.forEach(function (e) { estadoPor[e.id] = e; });
    const sigmaPor = {};
    M.sigma.forEach(function (s) { sigmaPor[s.simbolo] = s; });
    const gamaPor = {};
    M.gama.forEach(function (g) { gamaPor[g.simbolo] = g; });

    const ui = {};

    /* ================= mapa ================= */

    const mapaEl = $('mapa');
    const tiles = {};
    const rotulosRegiao = {};
    let heroiEl = null;

    function regiaoVizinha(x, y) {
      for (let i = 0; i < mapa.VIZINHOS.length; i++) {
        const r = mapa.regiaoDe(x + mapa.VIZINHOS[i].dx, y + mapa.VIZINHOS[i].dy);
        if (r) { return r; }
      }
      return null;
    }

    function construirMapa() {
      mapaEl.innerHTML = '';
      mapaEl.style.setProperty('--colunas', mapa.largura);
      mapaEl.style.setProperty('--linhas', mapa.altura);

      const grade = el('div', { classe: 'grade' });
      for (let y = 0; y < mapa.altura; y++) {
        for (let x = 0; x < mapa.largura; x++) {
          const c = mapa.tile(x, y);
          const ev = mapa.eventoEm(x, y);
          const t = el('div', { classe: 'tile' });

          if (ev) {
            t.className = 'tile evento tipo-' + ev.tipo + ' r-' + ev.estado +
              (DENTRO_DA_SALA[ev.tipo] ? ' objeto' : ' vao');
            t.setAttribute('data-regiao', ev.estado);
            t.setAttribute('title', ev.nome + ' — símbolo ' + PDA.mostrar(ev.simbolo));
            t.appendChild(icone(ev.tipo));
            t.appendChild(el('span', { classe: 'selo', texto: PDA.mostrar(ev.simbolo) }));
          } else if (c === '#') {
            t.className = 'tile parede';
          } else if (c === '~') {
            t.className = 'tile mar';
          } else if (c === 'L') {
            const r = regiaoVizinha(x, y);
            t.className = 'tile objeto lanterna r-' + r;
            t.setAttribute('data-regiao', r);
            t.setAttribute('title', 'Lanterna do farol');
            t.appendChild(icone('lanterna'));
          } else {
            const r = mapa.regiaoDe(x, y);
            t.className = 'tile chao r-' + r + (c === 'o' ? ' saida-portal' : '');
            t.setAttribute('data-regiao', r);
          }

          tiles[x + ',' + y] = t;
          grade.appendChild(t);
        }
      }
      mapaEl.appendChild(grade);

      M.estados.forEach(function (e) {
        const doEstado = mapa.tilesDe(e.id);
        // Canto inferior esquerdo da sala: ali nunca há tile de evento.
        let minX = Infinity;
        let maxY = -Infinity;
        doEstado.forEach(function (p) {
          if (p.y > maxY || (p.y === maxY && p.x < minX)) { minX = p.x; maxY = p.y; }
        });
        const rotulo = el('div', { classe: 'rotulo-regiao' }, [el('b', { texto: e.id }), ' · ' + e.nome]);
        rotulo.style.left = (minX * 100 / mapa.largura) + '%';
        rotulo.style.bottom = ((mapa.altura - maxY - 1) * 100 / mapa.altura) + '%';
        rotulosRegiao[e.id] = rotulo;
        mapaEl.appendChild(rotulo);
      });

      heroiEl = el('div', { classe: 'heroi' }, [icone('lia', '')]);
      mapaEl.appendChild(heroiEl);
    }

    // Move a personagem. opcoes.salto: aparece direto no destino (portal,
    // reinício). opcoes.ms: duração do deslize de um tile.
    ui.heroi = function (x, y, opcoes) {
      opcoes = opcoes || {};
      if (opcoes.ms) { heroiEl.style.setProperty('--passo', opcoes.ms + 'ms'); }
      if (opcoes.salto) {
        heroiEl.classList.add('sem-transicao');
        heroiEl.classList.remove('surgir');
      }
      heroiEl.style.left = (x * 100 / mapa.largura) + '%';
      heroiEl.style.top = (y * 100 / mapa.altura) + '%';
      if (opcoes.salto) {
        void heroiEl.offsetWidth;
        heroiEl.classList.remove('sem-transicao');
        heroiEl.classList.add('surgir');
      }
    };

    function animarUmaVez(no, classe) {
      no.classList.remove(classe);
      void no.offsetWidth;
      no.classList.add(classe);
    }

    ui.tremer = function () {
      animarUmaVez(heroiEl, 'tremer');
    };

    ui.piscarTile = function (ev, classe) {
      const t = ev && tiles[ev.x + ',' + ev.y];
      if (t) { animarUmaVez(t, classe); }
    };

    // Ilumina a região do estado atual.
    ui.regiaoAtiva = function (estado) {
      Object.keys(tiles).forEach(function (k) {
        const t = tiles[k];
        if (t.hasAttribute('data-regiao')) {
          t.classList.toggle('ativa', t.getAttribute('data-regiao') === estado);
        }
      });
      Object.keys(rotulosRegiao).forEach(function (id) {
        rotulosRegiao[id].classList.toggle('ativa', id === estado);
      });
      mapaEl.classList.toggle('aceso', M.finais.indexOf(estado) !== -1);
    };

    // Marca os tiles de travessia já usados (fechados atrás da personagem).
    ui.marcarUsados = function (atravessados) {
      mapa.EVENTOS.forEach(function (ev) {
        const k = ev.x + ',' + ev.y;
        tiles[k].classList.toggle('usado', Boolean(atravessados[k]));
      });
    };

    /* ================= painel: estado, símbolo, pilha, fita ================= */

    ui.estado = function (id) {
      const e = estadoPor[id];
      const final = M.finais.indexOf(id) !== -1;
      $('estado-id').textContent = id;
      $('estado-id').classList.toggle('final', final);
      $('estado-nome').textContent = e.nome + (final ? ' (final)' : '');
      $('estado-desc').textContent = e.descricao;
    };

    // Símbolo em processamento. null = nenhum.
    ui.processando = function (simbolo) {
      const caixa = $('simbolo-atual');
      if (simbolo === null || simbolo === undefined) {
        caixa.textContent = '—';
        caixa.classList.remove('ativo');
        $('simbolo-nome').textContent = 'nenhum símbolo lido ainda';
        $('transicao-atual').textContent = '';
        $('transicao-atual').classList.remove('erro');
        return;
      }
      caixa.textContent = PDA.mostrar(simbolo);
      caixa.classList.add('ativo');
      if (simbolo === '') {
        $('simbolo-nome').textContent = 'movimento vazio: nada é lido da fita';
      } else if (sigmaPor[simbolo]) {
        $('simbolo-nome').textContent = sigmaPor[simbolo].nome;
      } else {
        $('simbolo-nome').textContent = 'símbolo fora de Σ';
      }
    };

    // Transição aplicada (ou indefinida) pelo passo.
    ui.transicao = function (registro) {
      const no = $('transicao-atual');
      if (registro.ok) {
        no.textContent = PDA.formal(registro.transicao);
        no.classList.remove('erro');
      } else {
        no.textContent = PDA.indefinida(registro.estadoAntes, registro.lido, registro.topoAntes);
        no.classList.add('erro');
      }
    };

    let pilhaAtual = null;
    let limpezaPilha = null;

    function celula(simbolo) {
      const g = gamaPor[simbolo];
      const c = el('div', { classe: 'celula', title: g ? g.nome : simbolo });
      if (ICONE_DE_PILHA[simbolo]) { c.appendChild(icone(ICONE_DE_PILHA[simbolo], '')); }
      c.appendChild(el('span', { classe: 'letra', texto: simbolo }));
      c.appendChild(el('span', { classe: 'marca', texto: 'topo' }));
      return c;
    }

    // Desenha a pilha (string, topo à esquerda). Compara com a anterior para
    // animar o que foi empilhado e o que foi desempilhado.
    // opcoes.consulta: a transição só consultou o topo (ex.: "s, E; E").
    // opcoes.imediato: sem animação (reinício).
    ui.pilha = function (nova, opcoes) {
      opcoes = opcoes || {};
      const cont = $('pilha');
      const antiga = pilhaAtual === null || opcoes.imediato ? null : pilhaAtual;
      pilhaAtual = nova;
      $('pilha-texto').textContent = nova === '' ? 'λ (vazia)' : nova;

      let comum = 0;
      if (antiga !== null) {
        while (comum < antiga.length && comum < nova.length &&
          antiga.charAt(antiga.length - 1 - comum) === nova.charAt(nova.length - 1 - comum)) {
          comum++;
        }
      }
      const removidas = antiga === null ? '' : antiga.slice(0, antiga.length - comum);
      const quantasNovas = antiga === null ? 0 : nova.length - comum;

      if (limpezaPilha) { clearTimeout(limpezaPilha); limpezaPilha = null; }
      cont.innerHTML = '';

      const fantasmas = [];
      Array.from(removidas).forEach(function (s) {
        const c = celula(s);
        c.classList.add('saindo');
        fantasmas.push(c);
        cont.appendChild(c);
      });

      Array.from(nova).forEach(function (s, i) {
        const c = celula(s);
        if (i === 0) { c.classList.add('topo'); }
        if (i < quantasNovas) { c.classList.add('entrando'); }
        if (i === 0 && opcoes.consulta) { c.classList.add('consultado'); }
        cont.appendChild(c);
      });

      if (nova === '') {
        cont.appendChild(el('p', { classe: 'pilha-vazia', texto: 'vazia' }));
      }

      if (fantasmas.length) {
        limpezaPilha = setTimeout(function () {
          fantasmas.forEach(function (f) { f.remove(); });
          limpezaPilha = null;
        }, 300);
      }
    };

    // f = { simbolos, lidos, atual, erro, aberta, encerrada }
    ui.fita = function (f) {
      const cont = $('fita');
      cont.innerHTML = '';
      f.simbolos.forEach(function (s, i) {
        let classe = '';
        if (i === f.erro) { classe = 'erro'; }
        else if (i < f.lidos) { classe = 'lido'; }
        else if (i === f.atual) { classe = 'atual'; }
        else if (f.encerrada) { classe = 'nao-lido'; }
        cont.appendChild(el('span', { classe: classe, texto: s }));
      });
      if (f.aberta && !f.encerrada) {
        cont.appendChild(el('span', { classe: 'cursor', texto: '…', title: 'a fita cresce a cada evento' }));
      } else if (f.simbolos.length === 0) {
        cont.appendChild(el('span', { classe: 'vazia', texto: 'λ (cadeia vazia)' }));
      }

      const total = f.simbolos.length;
      const naoLidos = total - f.lidos;
      let legenda;
      if (f.aberta) {
        legenda = 'Percurso em WASD: a fita é escrita em tempo real. ' + f.lidos + ' símbolo(s) lido(s).';
      } else if (f.encerrada && naoLidos > 0) {
        legenda = f.lidos + ' de ' + total + ' símbolo(s) lido(s); ' + naoLidos + ' ficaram sem ler.';
      } else {
        legenda = f.lidos + ' de ' + total + ' símbolo(s) lido(s).';
      }
      $('fita-legenda').textContent = legenda;
    };

    // res = { aceita, motivo } ou null (em andamento, com texto informativo).
    ui.resultado = function (res, textoNeutro) {
      const no = $('resultado');
      no.innerHTML = '';
      if (!res) {
        no.className = 'resultado neutro';
        no.appendChild(el('span', { classe: 'veredito', texto: 'EM ANDAMENTO' }));
        no.appendChild(document.createTextNode(textoNeutro || ''));
        return;
      }
      no.className = 'resultado ' + (res.aceita ? 'aceita' : 'rejeitada');
      no.appendChild(el('span', { classe: 'veredito', texto: res.aceita ? 'ACEITA' : 'REJEITADA' }));
      no.appendChild(document.createTextNode(res.motivo));
    };

    /* ================= histórico ================= */

    function linhaHistorico(celulas, classe) {
      const tr = el('tr', { classe: classe || '' });
      celulas.forEach(function (c) { tr.appendChild(el('td', { texto: c })); });
      $('historico').appendChild(tr);
      const rolagem = $('historico-rolagem');
      rolagem.scrollTop = rolagem.scrollHeight;
      return tr;
    }

    ui.historicoLimpar = function () {
      $('historico').innerHTML = '';
      linhaHistorico(['0', M.inicial, '—', '—', M.simboloInicial, 'configuração inicial'], 'inicial');
    };

    ui.historicoLinha = function (r) {
      const classe = 'novo' + (!r.ok ? ' erro' : r.lido === '' ? ' lambda' : '');
      linhaHistorico([
        String(r.passo),
        r.estado,
        PDA.mostrar(r.lido),
        r.topoAntes === '' ? '—' : r.topoAntes,
        r.pilha === '' ? 'λ' : r.pilha,
        r.ok ? PDA.formal(r.transicao) : PDA.indefinida(r.estadoAntes, r.lido, r.topoAntes) + ' ✗'
      ], classe);
    };

    /* ================= dicas, avisos, modo ================= */

    ui.dicas = function (lista, textoPadrao) {
      const cont = $('dica');
      cont.innerHTML = '';
      if (!lista.length) {
        if (textoPadrao) { cont.appendChild(el('span', { texto: textoPadrao })); }
        return;
      }
      lista.forEach(function (d) {
        const linha = el('div', { classe: 'linha ' + d.efeito });
        linha.appendChild(el('kbd', { texto: d.tecla }));
        linha.appendChild(el('b', { texto: d.evento.nome }));
        if (d.efeito === 'ok') {
          linha.appendChild(document.createTextNode('— ' + d.evento.acao + ' (símbolo ' + d.simbolo + ')'));
          linha.appendChild(el('code', { texto: PDA.rotulo(d.transicao) }));
        } else if (d.efeito === 'bloqueia') {
          linha.appendChild(document.createTextNode('— bloqueado, nada entra na fita. ' + d.motivo));
        } else {
          linha.appendChild(document.createTextNode('— atenção: tocar aqui REJEITA a entrada. ' + d.motivo));
        }
        cont.appendChild(linha);
      });
    };

    ui.aviso = function (texto, tipo) {
      const no = $('aviso');
      no.textContent = texto || '';
      no.className = 'aviso' + (tipo ? ' ' + tipo : '');
    };

    ui.beco = function (texto) {
      const no = $('beco');
      no.innerHTML = '';
      if (!texto) {
        no.hidden = true;
      } else {
        no.hidden = false;
        const prefixo = 'Beco sem saída';
        const resto = texto.indexOf(prefixo) === 0 ? texto.slice(prefixo.length) : ': ' + texto;
        no.appendChild(el('strong', { texto: prefixo }));
        no.appendChild(document.createTextNode(resto + ' Encerre o percurso (será REJEITADA) ou reinicie.'));
      }
      $('btn-encerrar').classList.toggle('destaque', Boolean(texto));
      $('btn-reiniciar').classList.toggle('destaque', Boolean(texto));
    };

    ui.modo = function (estrito) {
      $('modo-jogo').classList.toggle('ativo', !estrito);
      $('modo-jogo').setAttribute('aria-pressed', String(!estrito));
      $('modo-estrito').classList.toggle('ativo', estrito);
      $('modo-estrito').setAttribute('aria-pressed', String(estrito));
      $('selo-modo').textContent = estrito ? 'Modo Estrito' : 'Modo Jogo';
      $('selo-modo').classList.toggle('estrito', estrito);
      $('modo-descricao').textContent = estrito
        ? 'Modo Estrito: como num PDA puro. Qualquer toque sem transição, inclusive em portão ou passagem fechados, entra na fita e a entrada é REJEITADA.'
        : 'Modo Jogo: portões e passagens (b, s) consultam o autômato antes; sem transição você é bloqueado e nada entra na fita. Estrela, chave e portal (*, a, c) sempre entram na fita.';
    };

    ui.exemplos = function (aoEscolher) {
      const cont = $('exemplos');
      cont.innerHTML = '';
      M.exemplos.forEach(function (ex, i) {
        const botao = el('button', { type: 'button', classe: 'exemplo ' + (ex.aceita ? 'aceita' : 'rejeitada') }, [
          el('span', { classe: 'cabeca' }, [
            el('span', { classe: 'cadeia', texto: ex.cadeia }),
            el('span', { classe: 'veredito', texto: ex.aceita ? 'ACEITA' : 'REJEITADA' })
          ]),
          el('span', { classe: 'titulo', texto: (i + 1) + '. ' + ex.titulo }),
          el('span', { classe: 'descricao', texto: ex.descricao })
        ]);
        botao.addEventListener('click', function () { aoEscolher(ex); });
        cont.appendChild(botao);
      });
    };

    /* ================= diagrama ================= */

    const nosEstado = {};
    const nosRotulo = {};
    const nosAresta = {};

    function construirDiagrama() {
      const xs = M.estados.map(function (e) { return e.x; });
      const ys = M.estados.map(function (e) { return e.y; });
      const minX = Math.min.apply(null, xs) - 80;
      const maxX = Math.max.apply(null, xs) + 90;
      const minY = Math.min.apply(null, ys) - 124;
      const maxY = Math.max.apply(null, ys) + 62;

      const raizSvg = svg('svg', {
        viewBox: [minX, minY, maxX - minX, maxY - minY].join(' '),
        role: 'img',
        'aria-label': 'Diagrama de estados do autômato de pilha, com ' + M.estados.length + ' estados e ' + M.delta.length + ' transições.'
      });

      function marcador(id, classe) {
        return svg('marker', { id: id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse' }, [
          svg('path', { d: 'M0 0L10 5L0 10z', classe: classe })
        ]);
      }
      raizSvg.appendChild(svg('defs', {}, [marcador('seta', 'ponta'), marcador('seta-usada', 'ponta-usada')]));

      // Agrupa transições por par (de, para): uma aresta, vários rótulos.
      const grupos = {};
      const ordem = [];
      M.delta.forEach(function (t, i) {
        const k = t.de + '>' + t.para;
        if (!grupos[k]) { grupos[k] = { de: t.de, para: t.para, itens: [] }; ordem.push(k); }
        grupos[k].itens.push({ t: t, indice: i });
      });

      const camadaArestas = svg('g', {});
      ordem.forEach(function (k) {
        const g = grupos[k];
        const a = estadoPor[g.de];
        const b = estadoPor[g.para];
        const grupo = svg('g', { classe: 'aresta' });
        nosAresta[k] = grupo;

        function rotulo(item, x, y, ancora) {
          const texto = svg('text', { classe: 'rotulo-t', x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': ancora, texto: PDA.rotulo(item.t) });
          nosRotulo[item.indice] = { texto: texto, aresta: grupo };
          grupo.appendChild(texto);
        }

        if (g.de === g.para) {
          // Laço acima do estado, com os rótulos empilhados sobre ele.
          grupo.appendChild(svg('path', {
            classe: 'linha',
            d: 'M' + (a.x - 13) + ' ' + (a.y - RAIO + 4) +
              'C' + (a.x - 46) + ' ' + (a.y - RAIO - 54) + ' ' + (a.x + 46) + ' ' + (a.y - RAIO - 54) + ' ' +
              (a.x + 13) + ' ' + (a.y - RAIO + 4)
          }));
          g.itens.forEach(function (item, i) {
            rotulo(item, a.x, a.y - RAIO - 44 - 17 * i, 'middle');
          });
        } else {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const comprimento = Math.hypot(dx, dy);
          const ux = dx / comprimento;
          const uy = dy / comprimento;
          grupo.appendChild(svg('path', {
            classe: 'linha',
            d: 'M' + (a.x + ux * RAIO).toFixed(1) + ' ' + (a.y + uy * RAIO).toFixed(1) +
              'L' + (b.x - ux * (RAIO + 3)).toFixed(1) + ' ' + (b.y - uy * (RAIO + 3)).toFixed(1)
          }));
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          if (Math.abs(uy) < 0.2) {
            // Aresta horizontal: rótulos acima da linha.
            g.itens.forEach(function (item, i) { rotulo(item, mx, my - 10 - 17 * i, 'middle'); });
          } else {
            // Aresta inclinada: rótulos do lado de baixo, longe dos laços.
            let nx = -uy;
            let ny = ux;
            if (ny < 0) { nx = -nx; ny = -ny; }
            g.itens.forEach(function (item, i) {
              rotulo(item, mx + nx * 14, my + ny * 14 + 5 + 17 * i, nx > 0 ? 'start' : 'end');
            });
          }
        }
        camadaArestas.appendChild(grupo);
      });
      raizSvg.appendChild(camadaArestas);

      M.estados.forEach(function (e) {
        const g = svg('g', { classe: 'estado' });
        if (e.id === M.inicial) {
          g.appendChild(svg('path', {
            classe: 'seta-inicial',
            d: 'M' + (e.x - RAIO) + ' ' + e.y + 'L' + (e.x - RAIO - 20) + ' ' + (e.y - 13) + 'L' + (e.x - RAIO - 20) + ' ' + (e.y + 13) + 'z'
          }));
        }
        g.appendChild(svg('circle', { classe: 'circulo', cx: e.x, cy: e.y, r: RAIO }));
        if (M.finais.indexOf(e.id) !== -1) {
          g.appendChild(svg('circle', { classe: 'anel', cx: e.x, cy: e.y, r: RAIO - 5 }));
        }
        g.appendChild(svg('text', { classe: 'id', x: e.x, y: e.y + 5.5, texto: e.id }));

        let nx = e.x;
        let ny = e.y + RAIO + 19;
        let ancora = 'middle';
        if (e.nomeEm === 'cima') { ny = e.y - RAIO - 11; }
        if (e.nomeEm === 'baixo-direita') { nx = e.x - 12; ancora = 'start'; }
        g.appendChild(svg('text', { classe: 'nome', x: nx, y: ny, 'text-anchor': ancora, texto: e.nome }));

        nosEstado[e.id] = g;
        raizSvg.appendChild(g);
      });

      $('diagrama').innerHTML = '';
      $('diagrama').appendChild(raizSvg);
    }

    // Destaca o estado atual e a última transição aplicada, no diagrama e na
    // tabela δ. indice = posição em M.delta, ou -1.
    ui.diagramaAtivo = function (estado, indice) {
      Object.keys(nosEstado).forEach(function (id) {
        nosEstado[id].classList.toggle('ativo', id === estado);
      });
      Object.keys(nosAresta).forEach(function (k) { nosAresta[k].classList.remove('usada'); });
      Object.keys(nosRotulo).forEach(function (i) { nosRotulo[i].texto.classList.remove('usada'); });
      if (indice >= 0 && nosRotulo[indice]) {
        nosRotulo[indice].texto.classList.add('usada');
        nosRotulo[indice].aresta.classList.add('usada');
      }
      Array.from($('tabela-delta').children).forEach(function (tr, i) {
        tr.classList.toggle('usada', i === indice);
      });
    };

    /* ================= definição formal, tabela δ, legendas ================= */

    function conjunto(itens) {
      return '{' + itens.join(', ') + '}';
    }

    function construirFormal() {
      const def = $('definicao');
      def.innerHTML = '';
      def.appendChild(el('p', { classe: 'tupla', texto: 'M = (Q, Σ, Γ, δ, q0, Z, F)' }));

      const dl = el('dl');
      function item(termo, valor, explicacao) {
        dl.appendChild(el('dt', { texto: termo }));
        dl.appendChild(el('dd', {}, [el('span', { classe: 'mono', texto: valor }), explicacao ? ' — ' + explicacao : '']));
      }
      item('Q', conjunto(M.estados.map(function (e) { return e.id; })), M.estados.length + ' estados, um por região do mapa');
      item('Σ', conjunto(M.sigma.map(function (s) { return s.simbolo; })), 'eventos do jogo');
      item('Γ', conjunto(M.gama.map(function (g) { return g.simbolo; })), 'o que pode estar na mochila');
      item('δ', M.delta.length + ' transições', 'na tabela ao lado');
      item('q0', M.inicial, 'estado inicial');
      item('Z', M.simboloInicial, 'símbolo inicial da pilha');
      item('F', conjunto(M.finais), 'aceitação por estado final');
      def.appendChild(dl);

      const obs = el('p', { classe: 'obs' });
      obs.appendChild(el('strong', { texto: 'Determinístico: ' }));
      obs.appendChild(document.createTextNode(
        'há no máximo uma transição para cada (estado, símbolo, topo). A única transição λ é a de q5 com Z no topo, ' +
        'e nenhuma outra transição de q5 usa Z, então não há escolha. Por isso a λ é aplicada assim que fica habilitada. '
      ));
      obs.appendChild(el('strong', { texto: 'Aceitação: ' }));
      obs.appendChild(document.createTextNode(
        'a entrada é aceita se, ao terminar, o estado atual pertence a F. Como a entrada em qf é "λ, Z; λ", aceitar também deixa a pilha vazia.'
      ));
      def.appendChild(obs);

      const corpo = $('tabela-delta');
      corpo.innerHTML = '';
      M.delta.forEach(function (t, i) {
        const tr = el('tr');
        [String(i + 1), t.de, PDA.mostrar(t.le), PDA.mostrar(t.topo), t.para, PDA.mostrar(t.empilha), PDA.rotulo(t), t.evento]
          .forEach(function (c) { tr.appendChild(el('td', { texto: c })); });
        corpo.appendChild(tr);
      });
    }

    function construirLegendas() {
      const sigma = $('legenda-sigma');
      sigma.innerHTML = '';
      M.sigma.forEach(function (s) {
        sigma.appendChild(el('tr', {}, [
          el('td', {}, [el('span', { classe: 'simb', texto: s.simbolo })]),
          el('td', { texto: s.nome }),
          el('td', { texto: s.operacao }),
          el('td', { texto: s.enredo })
        ]));
      });

      const gama = $('legenda-gama');
      gama.innerHTML = '';
      M.gama.forEach(function (g) {
        const simb = el('span', { classe: 'simb' });
        if (ICONE_DE_PILHA[g.simbolo]) { simb.appendChild(icone(ICONE_DE_PILHA[g.simbolo], '')); }
        simb.appendChild(document.createTextNode(g.simbolo));
        gama.appendChild(el('tr', {}, [
          el('td', {}, [simb]),
          el('td', { texto: g.nome }),
          el('td', { texto: g.enredo })
        ]));
      });

      const estados = $('legenda-estados');
      estados.innerHTML = '';
      M.estados.forEach(function (e) {
        const marca = (e.id === M.inicial ? ' (inicial)' : '') + (M.finais.indexOf(e.id) !== -1 ? ' (final)' : '');
        estados.appendChild(el('tr', {}, [
          el('td', {}, [el('span', { classe: 'simb', texto: e.id })]),
          el('td', { texto: e.nome + marca }),
          el('td', { texto: e.descricao })
        ]));
      });
    }

    construirMapa();
    construirDiagrama();
    construirFormal();
    construirLegendas();

    return ui;
  }

  raiz.UI = { criar: criar };
}(typeof self !== 'undefined' ? self : this));
