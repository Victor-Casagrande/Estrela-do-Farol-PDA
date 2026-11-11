/*
 * game.js — lógica do jogo (sem DOM): personagem, toques em WASD, roteiro e
 * a tradução de eventos do mapa em símbolos de entrada do PDA.
 *
 * O jogo nunca decide sozinho se uma ação vale: ele pergunta ao motor.
 * Uma ação só acontece se existir δ(estado, símbolo, topo).
 *
 * Invariante mantido aqui e conferido nos testes: ao fim de cada ação, a
 * região do mapa onde a personagem está é o estado atual do autômato. Por
 * isso toda mudança de estado desloca a personagem, inclusive a transição λ
 * (ela caminha até a escada e sobe).
 *
 * As funções devolvem "atos": o que aconteceu, na ordem, para a interface
 * animar. Cada ato tem:
 *   tipo      'caminhada' | 'laco' | 'travessia' | 'lambda' | 'rejeicao'
 *   simbolo   símbolo em processamento ('' para λ)
 *   registro  o passo do PDA (ou null numa caminhada)
 *   evento    o tile envolvido (ou null)
 *   quadros   posições sucessivas da personagem
 *   aplicarEm quantos quadros tocar antes de mostrar o registro no painel
 */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.JOGO = fabrica();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TECLAS = [
    { tecla: 'W', dx: 0, dy: -1 },
    { tecla: 'A', dx: -1, dy: 0 },
    { tecla: 'S', dx: 0, dy: 1 },
    { tecla: 'D', dx: 1, dy: 0 }
  ];

  function criar(opcoes) {
    const M = opcoes.M;
    const mapa = opcoes.mapa;
    const PDA = opcoes.PDA;
    const maquina = PDA.criar(M);

    const classeDe = {};
    M.sigma.forEach(function (s) { classeDe[s.simbolo] = s.classe; });

    const jogo = {
      maquina: maquina,
      modoEstrito: false,
      heroi: null,
      fita: '',
      atravessados: {},
      resultado: null
    };

    function chave(ev) {
      return ev.x + ',' + ev.y;
    }

    jogo.reiniciar = function () {
      maquina.reiniciar();
      jogo.heroi = { x: mapa.inicio.x, y: mapa.inicio.y };
      jogo.fita = '';
      jogo.atravessados = {};
      jogo.resultado = null;
    };

    // A transição λ também tem lugar no mapa: a personagem vai até a escada
    // e a atravessa.
    function atoLambda(registro) {
      const escada = mapa.eventoDe(registro.estadoAntes, '');
      const ato = { tipo: 'lambda', simbolo: '', registro: registro, evento: escada, quadros: [], aplicarEm: 0 };
      if (!escada) { return ato; }
      const rota = mapa.caminhoAte(jogo.heroi, escada);
      if (!rota) { return ato; }
      const saida = mapa.saidaDe(escada, rota.acesso);
      ato.quadros = rota.caminho.slice(1).concat([{ x: escada.x, y: escada.y }, saida]);
      ato.aplicarEm = ato.quadros.length - 1;
      jogo.atravessados[chave(escada)] = true;
      jogo.heroi = { x: saida.x, y: saida.y };
      return ato;
    }

    // Entrega o símbolo ao motor e traduz os passos resultantes em atos.
    // "ev" é o tile tocado (a personagem está ao lado dele) ou null.
    function aplicar(ev, simbolo) {
      const r = maquina.passo(simbolo);
      jogo.fita = maquina.consumidos;
      const atos = [];

      r.registros.forEach(function (registro) {
        if (!registro.ok) {
          atos.push({ tipo: 'rejeicao', simbolo: simbolo, registro: registro, evento: ev, quadros: [], aplicarEm: 0 });
          return;
        }
        if (registro.lido === '') {
          atos.push(atoLambda(registro));
          return;
        }
        const ato = { tipo: 'laco', simbolo: simbolo, registro: registro, evento: ev, quadros: [], aplicarEm: 0 };
        if (ev && registro.estado !== registro.estadoAntes) {
          const saida = mapa.saidaDe(ev, jogo.heroi);
          ato.tipo = 'travessia';
          if (ev.saida) {
            ato.quadros = [{ x: saida.x, y: saida.y, salto: true }];
            ato.aplicarEm = 0;
          } else {
            ato.quadros = [{ x: ev.x, y: ev.y }, saida];
            ato.aplicarEm = 1;
          }
          jogo.atravessados[chave(ev)] = true;
          jogo.heroi = { x: saida.x, y: saida.y };
        }
        atos.push(ato);
      });

      if (maquina.resultado) { jogo.resultado = maquina.resultado; }
      return atos;
    }

    // Tile de evento que a personagem alcança de onde está, na direção dada.
    function eventoNaDirecao(dx, dy) {
      const ev = mapa.eventoEm(jogo.heroi.x + dx, jogo.heroi.y + dy);
      if (!ev || ev.simbolo === '' || ev.estado !== maquina.estado) { return null; }
      return ev;
    }

    /*
     * Modo WASD. Um toque de tecla na direção (dx, dy).
     * repeticao = true quando o toque veio de tecla segurada (auto-repetição):
     * serve para continuar andando, mas nunca dispara evento.
     *
     * Devolve { tipo, ... }:
     *   'andou'      passo em chão livre; nenhum símbolo
     *   'parede'     nada a fazer nessa direção
     *   'repeticao'  tecla segurada diante de um evento: ignorado
     *   'bloqueado'  Modo Jogo, obstáculo sem transição: nada entra na fita
     *   'evento'     símbolo consumido com transição válida
     *   'rejeitada'  símbolo consumido sem transição: REJEITADA
     *   'encerrado'  o percurso já terminou
     */
    jogo.tentarMover = function (dx, dy, repeticao) {
      if (jogo.resultado) { return { tipo: 'encerrado' }; }

      const nx = jogo.heroi.x + dx;
      const ny = jogo.heroi.y + dy;
      if (mapa.caminhavel(nx, ny)) {
        jogo.heroi = { x: nx, y: ny };
        return { tipo: 'andou' };
      }

      const ev = eventoNaDirecao(dx, dy);
      if (!ev) { return { tipo: 'parede' }; }
      if (repeticao) { return { tipo: 'repeticao', evento: ev }; }

      const transicao = maquina.consultar(ev.simbolo);
      if (!transicao) {
        const motivo = PDA.explicarIndefinida(M, maquina.estado, ev.simbolo, maquina.topo());
        if (classeDe[ev.simbolo] === 'obstaculo' && !jogo.modoEstrito) {
          return { tipo: 'bloqueado', evento: ev, simbolo: ev.simbolo, motivo: motivo };
        }
      }

      const atos = aplicar(ev, ev.simbolo);

      // Chegou a um estado final de onde nada mais pode ser lido: a fita não
      // tem como crescer, então a entrada terminou.
      if (!jogo.resultado && maquina.ehFinal()) {
        const j = maquina.jogadasPossiveis();
        if (j.simbolos.length === 0 && !j.lambda) { jogo.resultado = maquina.encerrar(); }
      }

      return { tipo: transicao ? 'evento' : 'rejeitada', evento: ev, simbolo: ev.simbolo, atos: atos };
    };

    /*
     * Modo roteiro. Processa um símbolo como um PDA puro: sem bloqueio.
     * A personagem caminha até o tile do evento correspondente, se existir.
     */
    jogo.processarSimbolo = function (simbolo) {
      if (jogo.resultado) { return { tipo: 'encerrado', atos: [] }; }

      const atos = [];
      let ev = simbolo === '' ? null : mapa.eventoDe(maquina.estado, simbolo);
      if (ev) {
        const rota = mapa.caminhoAte(jogo.heroi, ev);
        if (rota) {
          if (rota.caminho.length > 1) {
            atos.push({ tipo: 'caminhada', simbolo: simbolo, registro: null, evento: ev, quadros: rota.caminho.slice(1), aplicarEm: 0 });
          }
          jogo.heroi = { x: rota.acesso.x, y: rota.acesso.y };
        } else {
          ev = null;
        }
      }

      const todos = atos.concat(aplicar(ev, simbolo));
      return { tipo: maquina.resultado ? 'rejeitada' : 'evento', evento: ev, simbolo: simbolo, atos: todos };
    };

    // Fim da entrada (botão "Encerrar percurso" ou fim do roteiro).
    jogo.encerrar = function () {
      if (!jogo.resultado) { jogo.resultado = maquina.encerrar(); }
      return jogo.resultado;
    };

    // O que cada tecla faria agora, para os eventos ao lado da personagem.
    // Consulta o motor sem consumir nada.
    jogo.dicas = function () {
      if (jogo.resultado) { return []; }
      const lista = [];
      TECLAS.forEach(function (t) {
        const ev = eventoNaDirecao(t.dx, t.dy);
        if (!ev) { return; }
        const transicao = maquina.consultar(ev.simbolo);
        let efeito = 'ok';
        let motivo = '';
        if (!transicao) {
          motivo = PDA.explicarIndefinida(M, maquina.estado, ev.simbolo, maquina.topo());
          efeito = classeDe[ev.simbolo] === 'obstaculo' && !jogo.modoEstrito ? 'bloqueia' : 'rejeita';
        }
        lista.push({ tecla: t.tecla, evento: ev, simbolo: ev.simbolo, transicao: transicao, efeito: efeito, motivo: motivo });
      });
      return lista;
    };

    // Texto do aviso de beco sem saída, ou null.
    jogo.becoSemSaida = function () {
      if (jogo.resultado || !maquina.semSaida()) { return null; }
      return PDA.explicarSemSaida(M, maquina.estado, maquina.topo());
    };

    jogo.reiniciar();
    return jogo;
  }

  return { TECLAS: TECLAS, criar: criar };
}));
