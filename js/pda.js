/*
 * pda.js — motor genérico de Autômato de Pilha determinístico (DPDA).
 *
 * Não conhece o jogo, o mapa nem o DOM. Recebe uma definição M no formato de
 * automato.js e simula: uma configuração é (estado, entrada consumida, pilha).
 *
 * Convenções:
 *   - '' representa λ.
 *   - A pilha é uma string com o TOPO À ESQUERDA (igual ao JFLAP).
 *   - Cada transição lê no máximo um símbolo da fita, desempilha no máximo um
 *     símbolo ("topo") e empilha uma cadeia ("empilha").
 *   - Transições λ são aplicadas assim que ficam habilitadas. Num autômato
 *     determinístico isso não é uma escolha: se δ(q, λ, X) existe, nenhuma
 *     δ(q, a, X) existe, então a λ é o único movimento possível.
 *   - Aceitação por estado final: a entrada acabou e o estado atual ∈ F.
 */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.PDA = fabrica();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LAMBDA = 'λ';
  const LIMITE_LAMBDA = 10000;

  function mostrar(s) {
    return s === '' ? LAMBDA : s;
  }

  // Notação do JFLAP: "lido, topo; empilha".
  function rotulo(t) {
    return mostrar(t.le) + ', ' + mostrar(t.topo) + '; ' + mostrar(t.empilha);
  }

  // Notação de função: δ(q, a, X) = (p, γ).
  function formal(t) {
    return 'δ(' + t.de + ', ' + mostrar(t.le) + ', ' + mostrar(t.topo) + ') = (' +
      t.para + ', ' + mostrar(t.empilha) + ')';
  }

  function indefinida(estado, simbolo, topo) {
    return 'δ(' + estado + ', ' + mostrar(simbolo) + ', ' + (topo === '' ? 'pilha vazia' : topo) + ') indefinida';
  }

  function nomeDe(lista, chave, valor) {
    const achado = (lista || []).find(function (item) { return item[chave] === valor; });
    return achado && achado.nome ? achado.nome : '';
  }

  function comNome(M, simboloDePilha) {
    const nome = nomeDe(M.gama, 'simbolo', simboloDePilha);
    return nome ? simboloDePilha + ' (' + nome + ')' : simboloDePilha;
  }

  function estadoComNome(M, id) {
    const nome = nomeDe(M.estados, 'id', id);
    return nome ? id + ' (' + nome + ')' : id;
  }

  function unicos(lista) {
    return lista.filter(function (v, i) { return lista.indexOf(v) === i; });
  }

  function listar(itens) {
    if (itens.length <= 1) { return itens.join(''); }
    return itens.slice(0, -1).join(', ') + ' ou ' + itens[itens.length - 1];
  }

  function conjunto(itens) {
    return '{' + itens.join(', ') + '}';
  }

  /* ---------- validação da definição ---------- */

  function validar(M) {
    const erros = [];
    const Q = {};
    const S = {};
    const G = {};

    (M.estados || []).forEach(function (e) {
      if (Q[e.id]) { erros.push('Estado repetido: ' + e.id + '.'); }
      Q[e.id] = true;
    });
    (M.sigma || []).forEach(function (s) {
      if (Array.from(s.simbolo).length !== 1) { erros.push('Símbolo de Σ deve ter um caractere: "' + s.simbolo + '".'); }
      if (S[s.simbolo]) { erros.push('Símbolo repetido em Σ: ' + s.simbolo + '.'); }
      S[s.simbolo] = true;
    });
    (M.gama || []).forEach(function (g) {
      if (Array.from(g.simbolo).length !== 1) { erros.push('Símbolo de Γ deve ter um caractere: "' + g.simbolo + '".'); }
      if (G[g.simbolo]) { erros.push('Símbolo repetido em Γ: ' + g.simbolo + '.'); }
      G[g.simbolo] = true;
    });

    if (!Q[M.inicial]) { erros.push('Estado inicial "' + M.inicial + '" não pertence a Q.'); }
    if (!G[M.simboloInicial]) { erros.push('Símbolo inicial da pilha "' + M.simboloInicial + '" não pertence a Γ.'); }
    (M.finais || []).forEach(function (f) {
      if (!Q[f]) { erros.push('Estado final "' + f + '" não pertence a Q.'); }
    });

    const delta = M.delta || [];
    delta.forEach(function (t, i) {
      const onde = 'Transição ' + (i + 1) + ' (' + t.de + ': ' + rotulo(t) + ')';
      if (!Q[t.de]) { erros.push(onde + ': origem fora de Q.'); }
      if (!Q[t.para]) { erros.push(onde + ': destino fora de Q.'); }
      if (t.le !== '' && !S[t.le]) { erros.push(onde + ': símbolo lido fora de Σ.'); }
      if (t.topo !== '' && !G[t.topo]) { erros.push(onde + ': topo fora de Γ.'); }
      Array.from(t.empilha).forEach(function (c) {
        if (!G[c]) { erros.push(onde + ': empilha "' + c + '", que não está em Γ.'); }
      });
    });

    // Determinismo: duas transições do mesmo estado conflitam quando podem
    // valer para a mesma configuração, isto é, quando os símbolos lidos são
    // iguais (ou um deles é λ) E os topos são iguais (ou um deles é λ).
    for (let i = 0; i < delta.length; i++) {
      for (let j = i + 1; j < delta.length; j++) {
        const a = delta[i];
        const b = delta[j];
        if (a.de !== b.de) { continue; }
        const mesmaLeitura = a.le === b.le || a.le === '' || b.le === '';
        const mesmoTopo = a.topo === b.topo || a.topo === '' || b.topo === '';
        if (mesmaLeitura && mesmoTopo) {
          erros.push('Não determinismo em ' + a.de + ': "' + rotulo(a) + '" conflita com "' + rotulo(b) + '".');
        }
      }
    }

    return { ok: erros.length === 0, erros: erros };
  }

  /* ---------- explicações derivadas da própria δ ---------- */

  // Por que δ(estado, simbolo, topo) não existe.
  function explicarIndefinida(M, estado, simbolo, topo) {
    const base = indefinida(estado, simbolo, topo);
    const alfabeto = (M.sigma || []).map(function (s) { return s.simbolo; });

    if (simbolo !== '' && alfabeto.indexOf(simbolo) === -1) {
      return base + ': o símbolo "' + simbolo + '" não pertence a Σ = ' + conjunto(alfabeto) + '.';
    }

    const mesmas = M.delta.filter(function (t) { return t.de === estado && t.le === simbolo; });
    const oQue = simbolo === '' ? 'a transição λ' : '"' + simbolo + '"';

    if (mesmas.length === 0) {
      return base + ': nenhuma transição com ' + oQue.replace('a transição λ', 'λ') + ' sai de ' + estadoComNome(M, estado) + '.';
    }

    const exigidos = unicos(mesmas.map(function (t) { return t.topo; }))
      .map(function (x) { return x === '' ? 'qualquer topo' : comNome(M, x); });
    const tem = topo === '' ? 'a pilha está vazia' : 'o topo é ' + comNome(M, topo);
    return base + ': em ' + estado + ', ' + oQue + ' exige ' + listar(exigidos) + ' no topo da pilha, mas ' + tem + '.';
  }

  // Por que a configuração (estado, topo) não tem movimento possível.
  function explicarSemSaida(M, estado, topo) {
    const saem = M.delta.filter(function (t) { return t.de === estado; });
    const onde = 'Beco sem saída em ' + estadoComNome(M, estado) + ' com ' +
      (topo === '' ? 'a pilha vazia' : comNome(M, topo) + ' no topo') + ': ';
    if (saem.length === 0) {
      return onde + 'nenhuma transição sai de ' + estado + ', e ' + estado + ' não é estado final.';
    }
    const rotulos = saem.map(function (t) { return '"' + rotulo(t) + '"'; });
    const exigidos = unicos(saem.map(function (t) { return t.topo; }))
      .map(function (x) { return x === '' ? 'qualquer topo' : comNome(M, x); });
    return onde + (saem.length === 1 ? 'a única transição de ' + estado + ' é ' : 'as transições de ' + estado + ' são ') +
      listar(rotulos) + ', que ' + (saem.length === 1 ? 'exige ' : 'exigem ') + listar(exigidos) +
      ' no topo. Nenhum símbolo de Σ pode ser lido e ' + estado + ' não é estado final.';
  }

  /* ---------- a máquina ---------- */

  function criar(M) {
    const v = validar(M);
    if (!v.ok) {
      throw new Error('Autômato inválido:\n- ' + v.erros.join('\n- '));
    }

    const porEstado = {};
    M.delta.forEach(function (t) {
      (porEstado[t.de] = porEstado[t.de] || []).push(t);
    });
    const alfabeto = M.sigma.map(function (s) { return s.simbolo; });
    const finais = M.finais.slice();

    const m = { definicao: M };
    let contador = 0;

    function topo() {
      return m.pilha.charAt(0);
    }

    // Transição para (estado atual, simbolo, topo atual), ou null.
    // simbolo '' procura uma transição λ.
    function achar(simbolo) {
      const lista = porEstado[m.estado] || [];
      const t = topo();
      for (let i = 0; i < lista.length; i++) {
        if (lista[i].le === simbolo && (lista[i].topo === '' || lista[i].topo === t)) {
          return lista[i];
        }
      }
      return null;
    }

    function aplicar(t, lido) {
      const registro = {
        passo: ++contador,
        ok: true,
        lido: lido,
        estadoAntes: m.estado,
        topoAntes: topo(),
        pilhaAntes: m.pilha,
        transicao: t,
        indice: M.delta.indexOf(t),
        motivo: ''
      };
      const resto = t.topo === '' ? m.pilha : m.pilha.slice(1);
      m.pilha = t.empilha + resto;
      m.estado = t.para;
      registro.estado = m.estado;
      registro.pilha = m.pilha;
      registro.consumidos = m.consumidos;
      m.historico.push(registro);
      return registro;
    }

    function rejeitar(lido, motivo, tipo) {
      const registro = {
        passo: ++contador,
        ok: false,
        lido: lido,
        estadoAntes: m.estado,
        topoAntes: topo(),
        pilhaAntes: m.pilha,
        transicao: null,
        indice: -1,
        motivo: motivo,
        estado: m.estado,
        pilha: m.pilha,
        consumidos: m.consumidos
      };
      m.historico.push(registro);
      m.resultado = { aceita: false, tipo: tipo, motivo: motivo, estado: m.estado, pilha: m.pilha };
      return registro;
    }

    function fecharLambda() {
      const registros = [];
      let t = achar('');
      while (t) {
        if (registros.length >= LIMITE_LAMBDA) {
          throw new Error('Ciclo de transições λ em ' + m.estado + '.');
        }
        registros.push(aplicar(t, ''));
        t = achar('');
      }
      return registros;
    }

    m.topo = topo;

    m.ehFinal = function () {
      return finais.indexOf(m.estado) !== -1;
    };

    // Volta à configuração inicial (q0, λ, Z). Devolve os registros das λ
    // que já estiverem habilitadas no início (nenhuma, neste autômato).
    m.reiniciar = function () {
      contador = 0;
      m.estado = M.inicial;
      m.pilha = M.simboloInicial;
      m.consumidos = '';
      m.historico = [];
      m.resultado = null;
      return fecharLambda();
    };

    // Consulta sem efeito colateral: qual transição o símbolo dispararia agora?
    m.consultar = function (simbolo) {
      if (m.resultado) { return null; }
      return achar(simbolo);
    };

    // Lê um símbolo da fita. Devolve { ok, registros }: o registro do símbolo
    // e, em seguida, os das transições λ que ele habilitou.
    m.passo = function (simbolo) {
      if (m.resultado) {
        return { ok: false, registros: [] };
      }
      const registros = fecharLambda();
      m.consumidos += simbolo;

      if (alfabeto.indexOf(simbolo) === -1) {
        registros.push(rejeitar(simbolo, explicarIndefinida(M, m.estado, simbolo, topo()), 'fora-de-sigma'));
        return { ok: false, registros: registros };
      }

      const t = achar(simbolo);
      if (!t) {
        registros.push(rejeitar(simbolo, explicarIndefinida(M, m.estado, simbolo, topo()), 'indefinida'));
        return { ok: false, registros: registros };
      }

      registros.push(aplicar(t, simbolo));
      return { ok: true, registros: registros.concat(fecharLambda()) };
    };

    // O que pode acontecer a partir de (estado, topo): símbolos de Σ que têm
    // transição e, se houver, a transição λ habilitada.
    m.jogadasPossiveis = function () {
      if (m.resultado) { return { simbolos: [], lambda: null }; }
      return {
        simbolos: alfabeto.filter(function (s) { return achar(s) !== null; }),
        lambda: achar('')
      };
    };

    // Beco sem saída: nada pode ser lido, não há λ e o estado não é final.
    m.semSaida = function () {
      if (m.resultado || m.ehFinal()) { return false; }
      const j = m.jogadasPossiveis();
      return j.simbolos.length === 0 && j.lambda === null;
    };

    // Fim da entrada: aplica as λ cabíveis e decide por estado final.
    m.encerrar = function () {
      if (m.resultado) { return m.resultado; }
      fecharLambda();
      const F = conjunto(finais);
      if (m.ehFinal()) {
        m.resultado = {
          aceita: true,
          tipo: 'estado-final',
          motivo: 'A entrada foi toda consumida e o autômato parou em ' + estadoComNome(M, m.estado) +
            ', que pertence a F = ' + F + '.' + (m.pilha === '' ? ' A pilha ficou vazia.' : ''),
          estado: m.estado,
          pilha: m.pilha
        };
      } else {
        const temLambda = M.delta.some(function (t) { return t.de === m.estado && t.le === ''; });
        m.resultado = {
          aceita: false,
          tipo: 'fora-de-F',
          motivo: 'A entrada terminou em ' + estadoComNome(M, m.estado) + ', que não pertence a F = ' + F + '.' +
            (temLambda ? ' ' + explicarIndefinida(M, m.estado, '', topo()) : ''),
          estado: m.estado,
          pilha: m.pilha
        };
      }
      return m.resultado;
    };

    m.reiniciar();
    return m;
  }

  // Executa uma cadeia inteira e devolve o resultado com o histórico (trace).
  function executar(M, cadeia) {
    const m = criar(M);
    const simbolos = Array.from(cadeia);
    let lidos = 0;
    for (let i = 0; i < simbolos.length; i++) {
      const r = m.passo(simbolos[i]);
      lidos++;
      if (!r.ok) { break; }
    }
    const fim = m.encerrar();
    return {
      aceita: fim.aceita,
      tipo: fim.tipo,
      motivo: fim.motivo,
      estado: m.estado,
      pilha: m.pilha,
      historico: m.historico,
      consumidos: simbolos.slice(0, lidos).join(''),
      restante: simbolos.slice(lidos).join('')
    };
  }

  return {
    LAMBDA: LAMBDA,
    mostrar: mostrar,
    rotulo: rotulo,
    formal: formal,
    indefinida: indefinida,
    validar: validar,
    explicarIndefinida: explicarIndefinida,
    explicarSemSaida: explicarSemSaida,
    criar: criar,
    executar: executar
  };
}));
