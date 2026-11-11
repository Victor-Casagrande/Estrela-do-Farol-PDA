/*
 * automato.js — definição formal de M = (Q, Σ, Γ, δ, q0, Z, F).
 *
 * A δ ESTÁ ESCRITA SÓ AQUI. O motor (pda.js), o jogo (game.js), o diagrama e a
 * tabela da interface (ui.js), o gerador do .jff (tools/gerar-jff.js) e os
 * testes leem esta mesma estrutura. Nenhum deles guarda cópia da δ.
 * A geometria do mapa (mapa.js) não é derivada daqui: ela é validada contra a
 * δ por tests/mapa.test.js.
 *
 * A cadeia vazia '' representa λ (em "le", "topo" e "empilha").
 * Em "empilha", o primeiro caractere fica no topo, como no JFLAP.
 */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.AUTOMATO = fabrica();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // x/y: posição do estado no diagrama (a mesma no SVG da página e no pda.jff).
  // nomeEm: onde o nome da região aparece no diagrama da página.
  const estados = [
    {
      id: 'q0', nome: 'Clareira', x: 80, y: 440, nomeEm: 'baixo',
      descricao: 'Ponto de partida. A árvore-chaveiro dá quantas chaves você quiser; a estrela caída está na trilha que sobe a colina.'
    },
    {
      id: 'q1', nome: 'Colina da Estrela', x: 240, y: 290, nomeEm: 'baixo-direita',
      descricao: 'Estrela na mochila. Para a Gruta, a passagem rúnica pede a estrela no topo; para a Ponte, o portão pede uma chave no topo.'
    },
    {
      id: 'q2', nome: 'Gruta de Cristal', x: 400, y: 140, nomeEm: 'baixo-direita',
      descricao: 'Atalho. A porta de saída engole uma chave: colha exatamente uma, ou a sobra vai encobrir a estrela.'
    },
    {
      id: 'q3', nome: 'Ponte do Guardião', x: 470, y: 290, nomeEm: 'baixo',
      descricao: 'O guardião recebe as chaves que estiverem por cima da estrela e só baixa a ponte quando a vê no topo.'
    },
    {
      id: 'q4', nome: 'Pátio do Portal', x: 630, y: 140, nomeEm: 'cima',
      descricao: 'O portal é alimentado pela estrela: ela precisa estar no topo e será consumida.'
    },
    {
      id: 'q5', nome: 'Farol', x: 800, y: 290, nomeEm: 'baixo',
      descricao: 'Do outro lado do portal. A urna recebe as chaves colhidas antes da estrela; com a mochila vazia, a escada se abre.'
    },
    {
      id: 'qf', nome: 'Lanterna acesa', x: 960, y: 140, nomeEm: 'cima',
      descricao: 'Objetivo. A estrela voltou ao farol e a mochila está vazia.'
    }
  ];

  // classe: como o modo WASD trata o símbolo quando não há transição.
  //   'obstaculo'    -> no Modo Jogo o personagem é bloqueado e nada entra na fita
  //   'irreversivel' -> o símbolo sempre entra na fita; sem transição, REJEITADA
  const sigma = [
    {
      simbolo: '*', nome: 'coletar a estrela', classe: 'irreversivel',
      operacao: 'empilha E',
      enredo: 'Lia guarda a estrela caída na mochila. Só existe uma, na Clareira.'
    },
    {
      simbolo: 'a', nome: 'coletar uma chave', classe: 'irreversivel',
      operacao: 'empilha K',
      enredo: 'Colhe uma chave de uma árvore-chaveiro. A chave nova cobre o que estava no topo.'
    },
    {
      simbolo: 's', nome: 'abrir uma passagem', classe: 'obstaculo',
      operacao: 'consulta E (desempilha E e reempilha E)',
      enredo: 'A luz da estrela abre a passagem rúnica e a ponte. A estrela não é gasta, mas precisa estar no topo.'
    },
    {
      simbolo: 'b', nome: 'utilizar uma chave', classe: 'obstaculo',
      operacao: 'desempilha K',
      enredo: 'Portão, guardião e urna engolem a chave que estiver no topo.'
    },
    {
      simbolo: 'c', nome: 'entrar em um portal', classe: 'irreversivel',
      operacao: 'desempilha E',
      enredo: 'O portal consome a estrela do topo e leva ao farol.'
    }
  ];

  const gama = [
    { simbolo: 'Z', nome: 'fundo da mochila', enredo: 'Símbolo inicial. Se está no topo, a mochila está vazia.' },
    { simbolo: 'K', nome: 'chave', enredo: 'Uma chave colhida e ainda não usada.' },
    { simbolo: 'E', nome: 'estrela', enredo: 'A estrela-guia do farol.' }
  ];

  const delta = [
    { de: 'q0', le: 'a', topo: 'Z', para: 'q0', empilha: 'KZ', evento: 'colhe uma chave' },
    { de: 'q0', le: 'a', topo: 'K', para: 'q0', empilha: 'KK', evento: 'colhe mais uma chave' },
    { de: 'q0', le: '*', topo: 'Z', para: 'q1', empilha: 'EZ', evento: 'pega a estrela e sobe a colina' },
    { de: 'q0', le: '*', topo: 'K', para: 'q1', empilha: 'EK', evento: 'pega a estrela; as chaves ficam por baixo' },

    { de: 'q1', le: 'a', topo: 'E', para: 'q1', empilha: 'KE', evento: 'colhe uma chave, que cobre a estrela' },
    { de: 'q1', le: 'a', topo: 'K', para: 'q1', empilha: 'KK', evento: 'colhe mais uma chave' },
    { de: 'q1', le: 's', topo: 'E', para: 'q2', empilha: 'E', evento: 'a estrela abre a passagem rúnica para a Gruta' },
    { de: 'q1', le: 'b', topo: 'K', para: 'q3', empilha: '', evento: 'gasta uma chave no portão da Ponte' },

    { de: 'q2', le: 'a', topo: 'E', para: 'q2', empilha: 'KE', evento: 'colhe uma chave, que cobre a estrela' },
    { de: 'q2', le: 'a', topo: 'K', para: 'q2', empilha: 'KK', evento: 'colhe mais uma chave' },
    { de: 'q2', le: 'b', topo: 'K', para: 'q4', empilha: '', evento: 'gasta uma chave na porta da Gruta' },

    { de: 'q3', le: 'b', topo: 'K', para: 'q3', empilha: '', evento: 'entrega uma chave ao guardião' },
    { de: 'q3', le: 's', topo: 'E', para: 'q4', empilha: 'E', evento: 'o guardião vê a estrela e baixa a ponte' },

    { de: 'q4', le: 'c', topo: 'E', para: 'q5', empilha: '', evento: 'o portal consome a estrela' },

    { de: 'q5', le: 'b', topo: 'K', para: 'q5', empilha: '', evento: 'deposita uma chave na urna' },
    { de: 'q5', le: '', topo: 'Z', para: 'qf', empilha: '', evento: 'mochila vazia: sobe a escada até a lanterna' }
  ];

  const exemplos = [
    {
      cadeia: '*sabc', aceita: true, titulo: 'Rota da Gruta',
      descricao: 'Estrela, passagem rúnica, uma chave, porta e portal. Usa cada símbolo de Σ uma vez.'
    },
    {
      cadeia: 'a*aabbscb', aceita: true, titulo: 'Rota da Ponte',
      descricao: 'Contagem aninhada: 1 chave antes da estrela (vai para a urna no fim) e 2 depois (portão e guardião).'
    },
    {
      cadeia: '*asbac', aceita: false, titulo: 'Cadeia do enunciado: ordem errada',
      descricao: 'É a cadeia de exemplo do enunciado. Aqui ela é rejeitada: a chave colhida depois da estrela a encobre, e a passagem exige a estrela no topo.'
    },
    {
      cadeia: 'a*sabc', aceita: false, titulo: 'Sobrou uma chave',
      descricao: 'Todo passo tem transição, mas a entrada acaba em q5 com uma chave na pilha: estado não final.'
    }
  ];

  return {
    nome: 'A Estrela do Farol',
    estados: estados,
    sigma: sigma,
    gama: gama,
    delta: delta,
    inicial: 'q0',
    simboloInicial: 'Z',
    finais: ['qf'],
    exemplos: exemplos
  };
}));
