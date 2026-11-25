/*
 * main.js — liga o motor (PDA), o jogo (JOGO) e a interface (UI).
 *
 * Dois modos de entrada sobre a mesma máquina:
 *   - WASD: cada toque em um tile de evento gera um símbolo em tempo real;
 *   - roteiro: uma cadeia digitada é processada símbolo a símbolo.
 *
 * O jogo calcula tudo na hora e devolve "atos"; aqui eles são tocados em
 * sequência para a página mostrar, em ordem, o símbolo em processamento, a
 * transição, a pilha e o deslocamento da personagem.
 */
(function () {
  'use strict';

  const M = AUTOMATO;
  const jogo = JOGO.criar({ M: M, mapa: MAPA, PDA: PDA });
  const ui = UI.criar({ M: M, mapa: MAPA, PDA: PDA });

  const PASSO_WASD = 85;        // ms por tile ao andar
  const PASSO_ROTEIRO = 45;     // ms por tile quando o roteiro leva a personagem
  const PAUSA_LAMBDA = 380;     // respiro antes do movimento λ
  const DURACAO_PASSO = 600;    // duração mínima de um passo do roteiro
  const INTERVALO_TECLA = 75;   // limite de velocidade com a tecla segurada

  const DICA_PADRAO = 'Encoste em um tile com selo e aperte a tecla na direção dele: cada toque gera um símbolo. Detalhes em "Como jogar", abaixo.';

  const campo = document.getElementById('roteiro');
  const mapaEl = document.getElementById('mapa');
  const dpadEl = document.querySelector('.dpad');
  const btnEncerrar = document.getElementById('btn-encerrar');
  const btnEnviar = document.getElementById('btn-enviar');
  const btnPasso = document.getElementById('btn-passo');
  const seloModo = document.getElementById('selo-modo');

  let execucao = 0;       // muda a cada reinício; cancela animações em curso
  let ocupado = false;    // tocando atos: teclado travado
  let origem = null;      // null | 'wasd' | 'roteiro'
  let roteiro = null;     // { simbolos, pos, texto, automatico }
  let fita = null;        // modelo da fita mostrada
  let ultimaTecla = 0;
  let estadoMostrado = M.inicial;   // estado que o painel exibe; fica atrás do motor durante a animação
  let causaRejeicao = null; // tile de evento cujo símbolo rejeitou a entrada, se houver
  let fimMostrado = false;   // o resultado deste percurso/roteiro já foi anunciado
  let cadeiaEditada = false; // o campo do roteiro foi editado depois desse resultado

  function esperar(ms) {
    return new Promise(function (resolver) { setTimeout(resolver, ms); });
  }

  /* ---------- falhas: o teclado nunca fica travado ---------- */

  // Refaz a tela a partir do jogo e do motor, que nunca param no meio de um
  // passo: só o desenho pode ter ficado pela metade. Nada do que é mostrado
  // depende do que a interface conseguiu desenhar antes da falha: a fita, a
  // posição do roteiro e o histórico são reconstruídos do que o motor leu.
  function ressincronizar() {
    const m = jogo.maquina;
    const consumidos = Array.from(m.consumidos);
    estadoMostrado = m.estado;

    if (origem === 'roteiro' && roteiro) {
      // No roteiro a fita mostrada é a cadeia inteira; a posição volta a ser
      // exatamente o que o motor já leu, para nenhum símbolo ser pulado.
      roteiro.pos = consumidos.length;
    } else {
      // Em WASD a fita é o que o motor consumiu, nem mais nem menos.
      fita.simbolos = consumidos.slice();
      if (consumidos.length > 0) { origem = 'wasd'; }
    }
    fita.lidos = consumidos.length;
    fita.atual = -1;
    const ultimo = m.historico[m.historico.length - 1];
    fita.erro = ultimo && !ultimo.ok ? fita.lidos - 1 : -1;

    ui.modo(jogo.modoEstrito);
    ui.heroi(jogo.heroi.x, jogo.heroi.y, { salto: true });
    ui.estado(m.estado);
    if (consumidos.length === 0) { ui.processando(null); }
    ui.pilha(m.pilha, { imediato: true });
    ui.fita(fita);
    ui.historicoLimpar();
    m.historico.forEach(function (registro) { ui.historicoLinha(registro); });
    ui.regiaoAtiva(m.estado);
    ui.diagramaAtivo(m.estado, -1);
    ui.marcarUsados(jogo.atravessados);
    if (jogo.resultado) {
      mostrarFim();
    } else {
      // Sem resultado no motor, nenhum veredito pode continuar sobre o mapa.
      ui.fim(null);
      atualizarContexto();
    }
  }

  function relatarFalha(erro) {
    if (typeof console !== 'undefined' && console.error) { console.error(erro); }
    if (roteiro) { roteiro.automatico = false; }
    try {
      ressincronizar();
      ui.aviso('Algo falhou ao animar este passo. A tela foi refeita a partir do estado do autômato; se algo parecer errado, clique em Reiniciar.', 'alerta');
    } catch (outro) {
      if (typeof console !== 'undefined' && console.error) { console.error(outro); }
    }
  }

  // Todo fluxo assíncrono iniciado por tecla ou botão passa por aqui, para
  // que uma exceção nunca vire uma promessa rejeitada sem tratamento.
  function vigiar(promessa) {
    promessa.catch(relatarFalha);
  }

  // O mesmo para os ouvintes síncronos (Reiniciar, Encerrar, Enviar, modos):
  // uma exceção da interface não escapa do clique; a tela é refeita.
  function proteger(ouvinte) {
    return function () {
      try {
        return ouvinte.apply(this, arguments);
      } catch (erro) {
        relatarFalha(erro);
        return undefined;
      }
    };
  }

  /* ---------- o que depende da configuração atual ---------- */

  // Fala do estado que o painel está mostrando, não do estado do motor: o
  // jogo calcula o passo inteiro na hora e a animação vem depois.
  function textoEmAndamento() {
    if (M.finais.indexOf(estadoMostrado) !== -1) {
      return 'Estado atual ' + estadoMostrado + ' ∈ F. Se a entrada terminasse agora, seria aceita.';
    }
    return 'Estado atual ' + estadoMostrado + ' ∉ F. Se a entrada terminasse agora, seria rejeitada.';
  }

  function atualizarContexto() {
    const fim = jogo.resultado;
    const emRoteiro = origem === 'roteiro';
    const semDicas = Boolean(fim) || emRoteiro;
    const beco = emRoteiro ? null : jogo.becoSemSaida();
    ui.dicas(semDicas ? [] : jogo.dicas(), semDicas || beco ? '' : DICA_PADRAO);
    ui.beco(beco);
    // No roteiro não há bloqueio: o mapa classifica como no Modo Estrito.
    ui.situacaoEventos(jogo.situacaoEventos({ estrito: emRoteiro }));
    if (!fim) { ui.resultado(null, textoEmAndamento()); }
    // "Encerrar percurso" é do modo WASD. Num roteiro a entrada já tem fim
    // definido: encerrá-la antes daria o veredito de um prefixo da cadeia.
    btnEncerrar.disabled = Boolean(fim) || emRoteiro;
    btnEnviar.disabled = origem !== 'wasd' || jogo.fita === '';
    // Roteiro terminado: "Passo a passo" só volta com Reiniciar ou ao editar
    // a cadeia depois do resultado, para um clique a mais não apagá-lo. A
    // edição fica lembrada em cadeiaEditada, porque esta função roda de novo
    // a cada troca de modo e não pode desabilitar o que a edição liberou.
    btnPasso.disabled = emRoteiro && Boolean(fim) && !cadeiaEditada;
    // O selo Modo Jogo / Modo Estrito só vale para o WASD: no roteiro some.
    seloModo.hidden = emRoteiro;
  }

  function mostrarFim() {
    // Só vale a edição feita depois do resultado: uma edição no meio do
    // roteiro não deixa o botão liberado quando o resultado chega.
    if (!fimMostrado) {
      fimMostrado = true;
      cadeiaEditada = false;
    }
    fita.encerrada = true;
    fita.atual = -1;
    ui.fita(fita);
    ui.resultado(jogo.resultado);
    ui.regiaoAtiva(jogo.maquina.estado);
    ui.fim(jogo.resultado, causaRejeicao);
    const aceita = jogo.resultado.aceita;
    const noRoteiro = origem === 'roteiro';
    ui.aviso(
      (noRoteiro ? 'Roteiro' : 'Percurso') + ' encerrado: ' + (aceita ? 'ACEITA' : 'REJEITADA') + '. ' +
        (noRoteiro ? 'Edite a cadeia ou clique em Reiniciar para rodar outra.'
          : aceita ? 'Reinicie para jogar de novo.' : 'Reinicie para tentar outra vez.'),
      aceita ? 'bom' : 'alerta'
    );
    atualizarContexto();
  }

  function reiniciar() {
    execucao++;
    ocupado = false;
    origem = null;
    roteiro = null;
    causaRejeicao = null;
    fimMostrado = false;
    cadeiaEditada = false;
    jogo.reiniciar();
    estadoMostrado = jogo.maquina.estado;
    fita = { simbolos: [], lidos: 0, atual: -1, erro: -1, aberta: true, encerrada: false };

    ui.heroi(jogo.heroi.x, jogo.heroi.y, { salto: true });
    ui.regiaoAtiva(jogo.maquina.estado);
    ui.marcarUsados(jogo.atravessados);
    ui.estado(jogo.maquina.estado);
    ui.processando(null);
    ui.pilha(jogo.maquina.pilha, { imediato: true });
    ui.fita(fita);
    ui.historicoLimpar();
    ui.diagramaAtivo(jogo.maquina.estado, -1);
    ui.aviso('');
    ui.fim(null);
    atualizarContexto();
  }

  /* ---------- tocar os atos devolvidos pelo jogo ---------- */

  function aplicarRegistro(ato) {
    const r = ato.registro;
    if (r.lido !== '') {
      fita.lidos = Array.from(r.consumidos).length;
      fita.atual = -1;
      if (!r.ok) { fita.erro = fita.lidos - 1; }
      ui.fita(fita);
    }
    estadoMostrado = r.estado;
    ui.estado(r.estado);
    ui.transicao(r);
    ui.pilha(r.pilha, { consulta: r.ok && r.transicao.topo !== '' && r.transicao.empilha === r.transicao.topo });
    ui.historicoLinha(r);
    ui.diagramaAtivo(r.estado, r.indice);
    ui.regiaoAtiva(r.estado);
    // O texto "em andamento" acompanha cada passo, inclusive os do meio de
    // uma animação com vários atos (ex.: portal seguido da λ). Numa rejeição
    // quem fala é o resultado final, mostrado logo em seguida.
    if (r.ok) { ui.resultado(null, textoEmAndamento()); }

    if (!r.ok) {
      causaRejeicao = ato.evento || null;
      ui.tremer();
      ui.piscarTile(ato.evento, 'negado');
    } else if (ato.evento) {
      ui.piscarTile(ato.evento, 'aceito');
      // Colheu, entregou ou depositou sem mudar de sala: um pulinho.
      if (ato.tipo === 'laco') { ui.pular(); }
    }
  }

  // Toca os atos em ordem. Devolve false se foi cancelado por um reinício.
  async function tocar(atos, msPorTile) {
    const ficha = execucao;
    ocupado = true;

    try {
      // As marcas do mapa valem para a configuração de antes do passo. Somem
      // durante a animação e voltam com a nova, em atualizarContexto. Fica
      // dentro do try: se lançar, o finally ainda libera o teclado (E-01).
      ui.situacaoEventos({});

      for (let a = 0; a < atos.length; a++) {
        const ato = atos[a];
        // Troca o símbolo exibido e limpa a transição do ato anterior.
        ui.processando(ato.simbolo);

        if (ato.tipo === 'lambda') {
          await esperar(PAUSA_LAMBDA);
          if (ficha !== execucao) { return false; }
        }

        let aplicado = !ato.registro;
        for (let i = 0; i < ato.quadros.length; i++) {
          if (!aplicado && i === ato.aplicarEm) {
            aplicarRegistro(ato);
            aplicado = true;
          }
          const q = ato.quadros[i];
          ui.heroi(q.x, q.y, { salto: Boolean(q.salto), ms: msPorTile });
          await esperar(q.salto ? 340 : msPorTile);
          if (ficha !== execucao) { return false; }
        }
        if (!aplicado) { aplicarRegistro(ato); }

        if (ato.tipo === 'travessia' || ato.tipo === 'lambda') {
          ui.marcarUsados(jogo.atravessados);
        }
      }
      return true;
    } finally {
      // Libera o teclado mesmo se algo acima lançar uma exceção. Depois de um
      // reinício não mexe: ele já liberou, e outra animação pode estar em curso.
      if (ficha === execucao) { ocupado = false; }
    }
  }

  /* ---------- modo WASD ---------- */

  async function mover(dx, dy, repeticao) {
    if (ocupado) { return; }
    if (jogo.resultado) {
      if (!repeticao) {
        ui.aviso(origem === 'roteiro'
          ? 'O roteiro já foi encerrado. Clique em Reiniciar para voltar ao WASD.'
          : 'O percurso já foi encerrado. Clique em Reiniciar para jogar de novo.', 'alerta');
      }
      return;
    }
    if (origem === 'roteiro') {
      if (!repeticao) { ui.aviso('Há um roteiro em andamento. Continue com "Passo a passo" ou clique em Reiniciar para voltar ao WASD.', 'alerta'); }
      return;
    }
    const agora = Date.now();
    if (repeticao && agora - ultimaTecla < INTERVALO_TECLA) { return; }
    ultimaTecla = agora;

    const r = jogo.tentarMover(dx, dy, repeticao);
    // Vira para o lado da tecla, mesmo quando encosta num evento ou parede.
    if (r.tipo !== 'encerrado') { ui.olhar(dx); }

    if (r.tipo === 'andou') {
      ui.heroi(jogo.heroi.x, jogo.heroi.y, { ms: PASSO_WASD });
      ui.aviso('');
      atualizarContexto();
      return;
    }

    if (r.tipo === 'bloqueado') {
      ui.tremer();
      ui.piscarTile(r.evento, 'negado');
      ui.aviso('Bloqueado por ' + r.evento.nome + ': ' + r.motivo + ' Nada foi anexado à fita.', 'alerta');
      return;
    }

    if (r.tipo === 'escada') {
      ui.tremer();
      ui.piscarTile(r.evento, 'negado');
      ui.aviso(r.evento.nome + ' fechada. ' + r.motivo + ' Nada foi anexado à fita.', 'alerta');
      return;
    }

    if (r.tipo === 'evento' || r.tipo === 'rejeitada') {
      origem = 'wasd';
      fita.simbolos.push(r.simbolo);
      fita.atual = fita.simbolos.length - 1;
      ui.fita(fita);
      ui.aviso('');
      ui.dicas([], '');
      const ficha = execucao;
      const inteiro = await tocar(r.atos, PASSO_WASD);
      if (!inteiro || ficha !== execucao) { return; }
      if (jogo.resultado) { mostrarFim(); } else { atualizarContexto(); }
    }
    // 'parede' e 'repeticao': nada acontece.
  }

  const DIRECOES = {
    w: [0, -1], arrowup: [0, -1],
    a: [-1, 0], arrowleft: [-1, 0],
    s: [0, 1], arrowdown: [0, 1],
    d: [1, 0], arrowright: [1, 0]
  };

  // O foco está no mapa (ou no direcional logo abaixo dele)?
  function focoNoMapa() {
    const ativo = document.activeElement;
    if (!ativo) { return false; }
    return ativo === mapaEl || Boolean(dpadEl && dpadEl.contains(ativo));
  }

  function focarMapa() {
    try { mapaEl.focus({ preventScroll: true }); } catch (e) { /* sem foco programático: segue pelo clique */ }
  }

  // Há um percurso em WASD em curso (ou pronto para começar)?
  function percursoWasdAtivo() {
    return !jogo.resultado && origem !== 'roteiro';
  }

  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) { return; }
    const alvo = e.target;
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) {
      return;
    }
    const tecla = String(e.key).toLowerCase();
    const d = DIRECOES[tecla];
    if (!d) { return; }

    // A tecla só é "do jogo" com o foco no mapa e um percurso WASD em curso.
    // Fora disso o navegador age normalmente: as setas rolam a página e não
    // movem a personagem. As letras W A S D continuam valendo em qualquer
    // foco que não seja um campo de texto, porque não têm ação padrão.
    const doJogo = focoNoMapa() && percursoWasdAtivo();
    if (tecla.indexOf('arrow') === 0 && !doJogo) { return; }
    if (doJogo) { e.preventDefault(); }
    vigiar(mover(d[0], d[1], e.repeat));
  });

  Array.from(document.querySelectorAll('.dpad button')).forEach(function (botao) {
    botao.addEventListener('click', function () {
      vigiar(mover(Number(botao.getAttribute('data-dx')), Number(botao.getAttribute('data-dy')), false));
    });
  });

  /* ---------- modo roteiro ---------- */

  // Espaços são ignorados; qualquer outro caractere é símbolo da cadeia.
  function lerCampo() {
    return Array.from(campo.value.replace(/\s+/g, ''));
  }

  function mostrarMapa() {
    const cartao = document.querySelector('.cartao-mapa');
    const caixa = cartao.getBoundingClientRect();
    if (caixa.top < 0 || caixa.top > window.innerHeight * 0.6) {
      cartao.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function iniciarRoteiro() {
    reiniciar();
    origem = 'roteiro';
    const simbolos = lerCampo();
    roteiro = { simbolos: simbolos, pos: 0, texto: simbolos.join(''), automatico: false };
    fita = { simbolos: simbolos.slice(), lidos: 0, atual: -1, erro: -1, aberta: false, encerrada: false };
    ui.fita(fita);
    ui.aviso('Roteiro "' + roteiro.texto + '": ' + (simbolos.length === 1 ? '1 símbolo' : simbolos.length + ' símbolos') +
      '. No roteiro não há bloqueio: símbolo sem transição rejeita.');
    atualizarContexto();
    mostrarMapa();
  }

  function encerrarRoteiro() {
    jogo.encerrar();
    mostrarFim();
  }

  // Processa o próximo símbolo. Devolve true se ainda há o que fazer.
  async function passoRoteiro() {
    if (!roteiro || jogo.resultado) { return false; }
    if (roteiro.pos >= roteiro.simbolos.length) {
      encerrarRoteiro();
      return false;
    }
    const ficha = execucao;
    const simbolo = roteiro.simbolos[roteiro.pos];
    fita.atual = roteiro.pos;
    ui.fita(fita);

    // A posição só avança depois que o motor leu o símbolo: se o desenho
    // acima falhar, o símbolo não é pulado.
    const r = jogo.processarSimbolo(simbolo);
    roteiro.pos++;
    const inteiro = await tocar(r.atos, PASSO_ROTEIRO);
    if (!inteiro || ficha !== execucao) { return false; }

    if (jogo.resultado) {
      mostrarFim();
      return false;
    }
    if (roteiro.pos >= roteiro.simbolos.length) {
      encerrarRoteiro();
      return false;
    }
    atualizarContexto();
    return true;
  }

  async function executar() {
    iniciarRoteiro();
    const ficha = execucao;
    roteiro.automatico = true;
    if (roteiro.simbolos.length === 0) {
      encerrarRoteiro();
      return;
    }
    await esperar(350);
    while (ficha === execucao && roteiro && roteiro.automatico) {
      const inicio = Date.now();
      const continua = await passoRoteiro();
      if (!continua || ficha !== execucao) { break; }
      const resto = DURACAO_PASSO - (Date.now() - inicio);
      if (resto > 0) { await esperar(resto); }
    }
  }

  async function passoAPasso() {
    if (ocupado) {
      if (roteiro) { roteiro.automatico = false; }
      return;
    }
    const texto = lerCampo().join('');
    if (origem !== 'roteiro' || !roteiro || roteiro.texto !== texto || jogo.resultado) {
      iniciarRoteiro();
      if (roteiro.simbolos.length === 0) {
        encerrarRoteiro();
        return;
      }
    }
    roteiro.automatico = false;
    await passoRoteiro();
  }

  /* ---------- botões ---------- */

  document.getElementById('btn-executar').addEventListener('click', function () { vigiar(executar()); });
  btnPasso.addEventListener('click', function () { vigiar(passoAPasso()); });
  // O Reiniciar do cartão do mapa devolve o foco ao mapa, para as setas
  // voltarem a mover a personagem; o do roteiro deixa o foco onde está.
  document.getElementById('btn-reiniciar').addEventListener('click', proteger(function () {
    reiniciar();
    focarMapa();
  }));
  document.getElementById('btn-reiniciar-roteiro').addEventListener('click', proteger(function () { reiniciar(); }));

  campo.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { vigiar(executar()); }
  });

  // Editar a cadeia libera o "Passo a passo" travado pelo fim de um roteiro,
  // e ele continua liberado até o próximo (re)início.
  campo.addEventListener('input', function () {
    if (fimMostrado) { cadeiaEditada = true; }
    btnPasso.disabled = false;
  });

  btnEncerrar.addEventListener('click', proteger(function () {
    // Durante um roteiro (Executar ou Passo a passo) o botão está desabilitado;
    // a checagem repete a regra para um clique disparado por outro caminho.
    if (ocupado || jogo.resultado || origem === 'roteiro') { return; }
    jogo.encerrar();
    mostrarFim();
  }));

  btnEnviar.addEventListener('click', proteger(function () {
    if (jogo.fita === '') { return; }
    campo.value = jogo.fita;
    ui.aviso('Percurso "' + jogo.fita + '" copiado para o roteiro. Use Executar ou Passo a passo para reexecutá-lo.', 'bom');
    campo.focus();
  }));

  function definirModo(estrito) {
    jogo.modoEstrito = estrito;
    ui.modo(estrito);
    atualizarContexto();
  }

  document.getElementById('modo-jogo').addEventListener('click', proteger(function () { definirModo(false); }));
  document.getElementById('modo-estrito').addEventListener('click', proteger(function () { definirModo(true); }));

  ui.exemplos(function (exemplo) {
    campo.value = exemplo.cadeia;
    vigiar(executar());
  });

  ui.modo(false);
  reiniciar();
  focarMapa();
}());
