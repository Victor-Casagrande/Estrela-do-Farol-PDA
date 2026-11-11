# A Estrela do Farol — jogo cuja lógica é um Autômato de Pilha

Trabalho 02 de Linguagens Formais e Autômatos. Um jogo 2D em grade, feito com HTML, CSS e
JavaScript puros, em que **todo evento é um símbolo de entrada consumido por um autômato de pilha
determinístico (PDA)**. O jogo só executa uma ação se existir uma transição
δ(estado atual, símbolo, topo da pilha).

| | |
|---|---|
| **Autor** | Victor Casagrande |
| **Curso** | Ciência da Computação — IFC Campus Videira |
| **Disciplina** | Linguagens Formais e Autômatos — Prof. Wanderson Rigo |
| **Entrega** | Trabalho 02 — 2026 |

**Jogar:** https://victor-casagrande.github.io/Estrela-do-Farol-PDA/

Arquivo do JFLAP: [`pda.jff`](pda.jff) (gerado a partir da mesma δ que o jogo usa).

> **Notação.** λ (notação do JFLAP 7.1) = ε nos slides: os dois símbolos representam o vazio. Este
> trabalho usa λ, como o JFLAP mostra por padrão.

---

## 1. Enredo

A estrela-guia do Farol de Âmbar caiu na trilha da colina. Lia, aprendiz de faroleira, sai da
Clareira para levá-la de volta. Ela carrega uma **mochila-tubo**: estreita, só dá para alcançar o
**último item guardado**. A mochila é a pilha do autômato.

- Chaves crescem nas **árvores-chaveiro** e podem ser colhidas quantas vezes Lia quiser.
- **Portões**, o **guardião** da ponte e a **urna** do farol engolem a chave que estiver no topo.
- **Passagens rúnicas** se abrem com a luz da estrela, sem gastá-la, mas só se a estrela estiver
  no topo. Uma chave guardada por cima a encobre.
- O **portal** é alimentado pela estrela e a consome.
- O farol só reacende se Lia chegar à lanterna de **mochila vazia**: toda chave colhida tem de ter
  sido usada.

### Mapa

Cada região do mapa é um estado do autômato. A região iluminada na tela é o estado atual.

```
#########################
#.......#...C...#.......#
#.T.....B.......#...L...#    q2 Gruta    | q4 Pátio  | qf Lanterna
#.......#.......#.......#
####S#######P#######^####
#.......#....G..#.......#
#.T.....B.......#.o...U.#    q1 Colina   | q3 Ponte  | q5 Farol
#.......#.......#.......#
####*####################
#.......#~~~~~~~~~~~~~~~~
#.T...@.#~~~~~~~~~~~~~~~~    q0 Clareira | mar
#.......#~~~~~~~~~~~~~~~~
#########~~~~~~~~~~~~~~~~
```

| Tile | O que é | Símbolo |
|---|---|---|
| `@` | início | — |
| `T` | árvore-chaveiro | `a` |
| `*` | estrela caída | `*` |
| `S` | passagem rúnica | `s` |
| `P` | ponte levadiça | `s` |
| `B` | portão / porta | `b` |
| `G` | guardião da ponte | `b` |
| `U` | urna do farol | `b` |
| `C` | portal (sai em `o`) | `c` |
| `^` | escada da lanterna | λ |
| `L` | lanterna (objetivo) | — |

Da Colina saem dois caminhos que se reencontram no Pátio: a **Gruta** (passagem `s`, exige a
estrela no topo) e a **Ponte** (portão `b`, exige uma chave no topo). Qual deles está aberto
depende da ordem em que os itens foram empilhados.

---

## 2. Definição formal

**M = (Q, Σ, Γ, δ, q0, Z, F)**

| Componente | Valor |
|---|---|
| **Q** | {q0, q1, q2, q3, q4, q5, qf} — 7 estados |
| **Σ** | {`*`, `a`, `s`, `b`, `c`} |
| **Γ** | {Z, K, E} |
| **q0** | estado inicial |
| **Z** | símbolo inicial da pilha |
| **F** | {qf} — aceitação por estado final |

| Estado | Região | Papel no enredo |
|---|---|---|
| q0 | Clareira | início; a estrela ainda está no chão |
| q1 | Colina da Estrela | estrela na mochila; bifurcação |
| q2 | Gruta de Cristal | atalho; exige colher exatamente uma chave |
| q3 | Ponte do Guardião | paga-se pedágio em chaves até a estrela aparecer |
| q4 | Pátio do Portal | o portal consome a estrela |
| q5 | Farol | a urna recebe as chaves que estavam por baixo da estrela |
| qf | Lanterna acesa | objetivo |

### Σ: o que cada símbolo faz na pilha

| Símbolo | Evento | Operação na pilha | No jogo |
|---|---|---|---|
| `*` | coletar a estrela | empilha E | só existe uma, na Clareira |
| `a` | coletar uma chave | empilha K | a chave nova cobre o que estava no topo |
| `s` | abrir uma passagem | **consulta** E (desempilha E e reempilha E) | exige a estrela no topo e não a consome |
| `b` | utilizar uma chave | **desempilha** K | exige uma chave no topo e a consome |
| `c` | entrar em um portal | desempilha E | exige a estrela no topo e a consome |

`s` e `b` são operações diferentes: `b` gasta o item, `s` apenas confere o topo. É a mesma ideia
do exercício 0c da Aula 30 (LFA-30), em que a transição `a, B; B` troca o topo B por ele mesmo.

### Γ: o que há na mochila

| Símbolo | Significa |
|---|---|
| Z | fundo da mochila; se está no topo, a mochila está vazia |
| K | uma chave colhida e ainda não usada |
| E | a estrela |

### Tabela de transições δ

Notação do JFLAP: `lido, topo; empilha`, com λ para vazio (λ no JFLAP 7.1 = ε nos slides). Em
"empilha", o primeiro símbolo fica no topo.

| # | De | Lido | Topo | Para | Empilha | JFLAP | No enredo |
|---|---|---|---|---|---|---|---|
| 1 | q0 | a | Z | q0 | KZ | `a, Z; KZ` | colhe uma chave |
| 2 | q0 | a | K | q0 | KK | `a, K; KK` | colhe mais uma chave |
| 3 | q0 | * | Z | q1 | EZ | `*, Z; EZ` | pega a estrela e sobe a colina |
| 4 | q0 | * | K | q1 | EK | `*, K; EK` | pega a estrela; as chaves ficam por baixo |
| 5 | q1 | a | E | q1 | KE | `a, E; KE` | colhe uma chave, que cobre a estrela |
| 6 | q1 | a | K | q1 | KK | `a, K; KK` | colhe mais uma chave |
| 7 | q1 | s | E | q2 | E | `s, E; E` | a estrela abre a passagem rúnica para a Gruta |
| 8 | q1 | b | K | q3 | λ | `b, K; λ` | gasta uma chave no portão da Ponte |
| 9 | q2 | a | E | q2 | KE | `a, E; KE` | colhe uma chave, que cobre a estrela |
| 10 | q2 | a | K | q2 | KK | `a, K; KK` | colhe mais uma chave |
| 11 | q2 | b | K | q4 | λ | `b, K; λ` | gasta uma chave na porta da Gruta |
| 12 | q3 | b | K | q3 | λ | `b, K; λ` | entrega uma chave ao guardião |
| 13 | q3 | s | E | q4 | E | `s, E; E` | o guardião vê a estrela e baixa a ponte |
| 14 | q4 | c | E | q5 | λ | `c, E; λ` | o portal consome a estrela |
| 15 | q5 | b | K | q5 | λ | `b, K; λ` | deposita uma chave na urna |
| 16 | q5 | λ | Z | qf | λ | `λ, Z; λ` | mochila vazia: sobe a escada até a lanterna |

### Por que determinístico

Há no máximo uma transição para cada trio (estado, símbolo, topo). A única transição λ é
δ(q5, λ, Z), e nenhuma outra transição de q5 tem Z no topo, então nunca existem dois movimentos
possíveis para a mesma configuração.

Escolhi um PDA determinístico porque num jogo cada ação precisa ter um efeito só: se duas
transições servissem para o mesmo toque, o jogo teria de adivinhar qual o jogador quis. Como
consequência, a transição λ é aplicada **assim que fica habilitada** (não é uma escolha: em
(q5, Z) ela é o único movimento que existe). Ela aparece no histórico como um passo próprio, com
λ na coluna "Lido".

### Aceitação

Por estado final: a entrada é aceita se, ao terminar, o estado atual pertence a F. Seguindo o
padrão do exercício 0e da Aula 30 (LFA-30), em que se chega ao estado final por `ε, Z; ε`, a
entrada em qf é `λ, Z; λ`, então aceitar também deixa a pilha vazia.

### Linguagem reconhecida

```
L(M) = { aⁿ * s a b c bⁿ      |  n ≥ 0 }            (rota da Gruta)
     ∪ { aⁿ * aᵐ bᵐ s c bⁿ   |  n ≥ 0,  m ≥ 1 }    (rota da Ponte)
```

Nestas fórmulas o `*` é **sempre o símbolo de Σ** (coletar a estrela), nunca o fecho de Kleene.
Toda repetição está escrita com expoente: `aⁿ` é `a` repetido n vezes.

- `aⁿ` são as chaves colhidas **antes** da estrela. Ficam por baixo dela e só voltam a ser
  alcançáveis depois do portal: são os `bⁿ` da urna.
- Entre a estrela e o portal `c` está o caminho da Colina ao Pátio. Pela Gruta, `s a b`. Pela
  Ponte, `aᵐ bᵐ s`: as `m` chaves colhidas depois da estrela têm de ser todas gastas (portão +
  guardião) antes de a ponte baixar.

### Por que um autômato finito não resolveria

Onde a pilha limita o jogo:

- **Ordem (LIFO).** Chave colhida depois da estrela a encobre: a passagem `s` e o portal `c`
  ficam fechados até as chaves de cima serem gastas. Chave colhida antes fica por baixo e só
  serve depois do portal.
- **Quantidade exata.** Na Gruta é preciso colher exatamente uma chave. Com duas, sobra uma sobre
  a estrela e o portal não abre.
- **Quantidade global.** O número de chaves usadas tem de ser igual ao de colhidas, senão a pilha
  não volta a Z e a λ para qf nunca dispara.

**L(M) não é regular.** A prova é por contradição, com o lema do bombeamento. Como acima, o `*` é
o símbolo de Σ e toda repetição é um expoente.

1. Suponha que L(M) seja regular.
2. Seja R = { aⁱ * s a b c bʲ | i ≥ 0, j ≥ 0 }. R é regular: um autômato finito lê os `a`, depois
   a sequência fixa `* s a b c`, depois os `b`, sem precisar contar nada.
3. Linguagens regulares são fechadas por interseção, então L' = L(M) ∩ R seria regular. As cadeias
   da rota da Ponte têm um `a` logo depois da estrela e ficam fora de R; da rota da Gruta sobram as
   que têm i = j. Logo L' = { aⁿ * s a b c bⁿ | n ≥ 0 }.
4. Seja p ≥ 1 a constante do lema do bombeamento para L'. Tome w = aᵖ * s a b c bᵖ. Então w ∈ L' e
   |w| = 2p + 5 ≥ p.
5. O lema garante uma divisão w = xyz com |xy| ≤ p e |y| ≥ 1 tal que x yⁱ z ∈ L' para todo i ≥ 0.
   Como |xy| ≤ p, x e y ficam inteiros dentro dos p primeiros símbolos, que são todos `a`:
   x = aʳ, y = aᵏ, z = aᵖ⁻ʳ⁻ᵏ * s a b c bᵖ, com k ≥ 1 e r + k ≤ p.
6. Bombeando com i = 2: x y² z = aᵖ⁺ᵏ * s a b c bᵖ. Essa cadeia tem p + k letras `a` antes da
   estrela e p letras `b` no fim, e p + k ≠ p porque k ≥ 1. Portanto x y² z ∉ L'.
7. Isso contradiz o lema. Logo L' não é regular e, pelo passo 3, L(M) também não é.

Em termos do jogo: um autômato finito não tem como lembrar quantas chaves foram colhidas antes da
estrela para cobrar o mesmo número na urna; a pilha tem.

---

## 3. Os 4 exemplos da interface

A pilha é escrita com o **topo à esquerda**. "Topo" é o símbolo consultado pelo passo; "Estado" e
"Pilha" são os de depois do passo.

### 1. `*sabc` — ACEITA (rota da Gruta)

Usa cada símbolo de Σ uma vez.

| Passo | Estado | Lido | Topo | Pilha | Transição aplicada |
|---|---|---|---|---|---|
| 0 | q0 | — | — | Z | configuração inicial |
| 1 | q1 | * | Z | EZ | δ(q0, *, Z) = (q1, EZ) |
| 2 | q2 | s | E | EZ | δ(q1, s, E) = (q2, E) |
| 3 | q2 | a | E | KEZ | δ(q2, a, E) = (q2, KE) |
| 4 | q4 | b | K | EZ | δ(q2, b, K) = (q4, λ) |
| 5 | q5 | c | E | Z | δ(q4, c, E) = (q5, λ) |
| 6 | qf | λ | Z | λ | δ(q5, λ, Z) = (qf, λ) |

Entrada toda consumida, estado qf ∈ F, pilha vazia. No mapa, no passo 5 Lia sai do portal dentro
do Farol; no passo 6 ela sobe a escada até a Lanterna.

### 2. `a*aabbscb` — ACEITA (rota da Ponte)

Contagem aninhada: uma chave antes da estrela (vai para a urna no fim) e duas depois (portão e
guardião).

| Passo | Estado | Lido | Topo | Pilha | Transição aplicada |
|---|---|---|---|---|---|
| 0 | q0 | — | — | Z | configuração inicial |
| 1 | q0 | a | Z | KZ | δ(q0, a, Z) = (q0, KZ) |
| 2 | q1 | * | K | EKZ | δ(q0, *, K) = (q1, EK) |
| 3 | q1 | a | E | KEKZ | δ(q1, a, E) = (q1, KE) |
| 4 | q1 | a | K | KKEKZ | δ(q1, a, K) = (q1, KK) |
| 5 | q3 | b | K | KEKZ | δ(q1, b, K) = (q3, λ) |
| 6 | q3 | b | K | EKZ | δ(q3, b, K) = (q3, λ) |
| 7 | q4 | s | E | EKZ | δ(q3, s, E) = (q4, E) |
| 8 | q5 | c | E | KZ | δ(q4, c, E) = (q5, λ) |
| 9 | q5 | b | K | Z | δ(q5, b, K) = (q5, λ) |
| 10 | qf | λ | Z | λ | δ(q5, λ, Z) = (qf, λ) |

### 3. `*asbac` — REJEITADA (ordem errada)

É a cadeia que aparece como exemplo no enunciado. Aqui ela mostra a restrição de ordem: a chave
colhida depois da estrela a encobre.

| Passo | Estado | Lido | Topo | Pilha | Transição aplicada |
|---|---|---|---|---|---|
| 0 | q0 | — | — | Z | configuração inicial |
| 1 | q1 | * | Z | EZ | δ(q0, *, Z) = (q1, EZ) |
| 2 | q1 | a | E | KEZ | δ(q1, a, E) = (q1, KE) |
| 3 | q1 | s | K | KEZ | δ(q1, s, K) indefinida ✗ |

Em q1, `s` exige E no topo, mas o topo é K. Ficam `bac` sem ler.

### 4. `a*sabc` — REJEITADA (terminou fora de F)

Todo símbolo tem transição, mas a chave colhida antes da estrela nunca é usada.

| Passo | Estado | Lido | Topo | Pilha | Transição aplicada |
|---|---|---|---|---|---|
| 0 | q0 | — | — | Z | configuração inicial |
| 1 | q0 | a | Z | KZ | δ(q0, a, Z) = (q0, KZ) |
| 2 | q1 | * | K | EKZ | δ(q0, *, K) = (q1, EK) |
| 3 | q2 | s | E | EKZ | δ(q1, s, E) = (q2, E) |
| 4 | q2 | a | E | KEKZ | δ(q2, a, E) = (q2, KE) |
| 5 | q4 | b | K | EKZ | δ(q2, b, K) = (q4, λ) |
| 6 | q5 | c | E | KZ | δ(q4, c, E) = (q5, λ) |

A entrada termina em q5 ∉ F: δ(q5, λ, K) é indefinida, porque a λ exige Z no topo. A cadeia
corrigida `a*sabcb` é aceita.

---

## 4. Como o jogo usa o autômato

### Modo WASD (híbrido)

Anda-se com `W` `A` `S` `D`. **Andar em chão livre não gera símbolo.** Os tiles de evento (árvore,
estrela, passagem, ponte, portão, guardião, urna, portal) são sólidos: para interagir, encoste e
aperte a tecla na direção do tile.

As setas também movem, mas só quando o foco está no mapa (ele recebe o foco ao abrir a página e ao
ser clicado) e há um percurso em WASD em curso. Fora disso as setas são do navegador e rolam a
página normalmente.

- **Um toque, um símbolo.** Cada pressionamento gera no máximo um símbolo. Segurar a tecla
  continua a caminhada, mas nunca dispara evento: para colher a segunda chave é preciso soltar e
  apertar de novo. Isso evita coleta acidental.
- **Dica antes de tocar.** Ao encostar em um tile, a página mostra o que a tecla fará, consultando
  o motor sem consumir nada.
- **Obstáculos (`s`, `b`).** O jogo consulta o motor *antes* de consumir o símbolo. Se não houver
  transição para (estado, símbolo, topo), a personagem é bloqueada, **nada é anexado à fita** e
  aparece a transição indefinida com o motivo, por exemplo: "δ(q1, b, E) indefinida: em q1, "b"
  exige K (chave) no topo da pilha, mas o topo é E (estrela)".
- **Eventos irreversíveis (`*`, `a`, `c`).** O símbolo sempre entra na fita, sem consulta prévia.
  Na prática só o `c` pode ficar sem transição onde existe um tile: no Pátio com uma chave sobre a
  estrela, tocar o portal REJEITA a entrada na hora. A estrela (`*`) só existe na Clareira e as
  árvores (`a`) só existem na Clareira, na Colina e na Gruta, e nesses estados δ está definida
  para qualquer topo possível; por isso tocar neles nunca rejeita.
- **Encerrar percurso.** Sinaliza o fim da entrada: aceita se o estado atual ∈ F, senão REJEITADA.
  Chegar a qf encerra sozinho, porque não há mais nenhum evento na Lanterna e a fita não teria
  como crescer. O botão é só do modo WASD: durante um roteiro ele fica desabilitado, porque a
  cadeia do roteiro já tem fim definido e encerrá-la antes daria o veredito de um prefixo.
- **Modo Jogo / Modo Estrito.** No Modo Estrito, *qualquer* toque sem transição, inclusive em
  obstáculo, entra na fita e rejeita, como num PDA puro. O modo ativo fica sempre visível.
- **Enviar percurso para o roteiro.** Copia a sequência gerada em WASD para o campo do roteiro,
  para reexecutá-la passo a passo.
- **Beco sem saída.** Se nenhum símbolo de Σ tem transição para (estado, topo), não há λ
  habilitada e o estado não é final, a página avisa e explica o porquê. O único caso alcançável é
  o Pátio com uma chave sobre a estrela. O aviso cobre apenas esse **travamento imediato**: ele não
  prevê derrotas futuras. Na Gruta com duas ou mais chaves sobre a estrela ainda há jogadas
  (colher outra chave, abrir a porta), então o aviso não aparece, embora a partida já esteja
  perdida; ele só surge depois da porta, quando o Pátio trava.

### Região = estado

Ao fim de cada passo, a região onde Lia está é o estado atual do autômato. Para isso:

- toda travessia é de mão única (a passagem se fecha atrás);
- toda mudança de estado desloca a personagem, **inclusive a transição λ**: quando `λ, Z; λ`
  dispara, Lia caminha até a escada e sobe para a Lanterna.

### Modo roteiro

Um campo de texto recebe a cadeia (ex.: `*sabc`). **Executar** roda animado, cerca de 600 ms por
símbolo; **Passo a passo** processa um símbolo por clique; **Reiniciar** volta à configuração
inicial. Depois de ACEITA ou REJEITADA, o **Passo a passo** fica desabilitado até Reiniciar ou
editar a cadeia, para um clique a mais não apagar o resultado.

No roteiro não há bloqueio: símbolo sem transição rejeita, e símbolo fora de Σ rejeita com aviso.
Dois enganos comuns ganham uma dica junto da rejeição: maiúscula de um símbolo válido ("Você quis
dizer "s"?") e `λ` ou `ε` digitados ("λ é o movimento vazio, não um símbolo de entrada"). A cada
símbolo a personagem vai até o tile do evento correspondente. Espaços são ignorados.

### O que a página mostra em tempo real

Estado atual (destacado no mapa e no diagrama), símbolo sendo processado, fita com o que já foi
lido e o que falta, pilha com o topo destacado e animação de empilhar/desempilhar, histórico
`Passo | Estado | Lido | Topo | Pilha | Transição aplicada` e o resultado ACEITA ou REJEITADA com o
motivo.

Em janelas de até 1080 px de largura (ou com zoom alto) a página fica em uma coluna e o painel
completo vai para baixo do mapa. Nesse caso uma **faixa compacta** fica presa ao topo enquanto se
joga ou se roda um roteiro, com o estado atual, o símbolo em processamento, a pilha (topo à
esquerda) e o resultado.

---

## 5. Arquivos

A tabela δ está escrita em **um único arquivo**, `js/automato.js`. O motor, o diagrama e a tabela
da página, o gerador do `.jff` e os testes leem essa mesma estrutura; nenhum deles guarda cópia da
δ.

O mapa é outra coisa: `js/mapa.js` desenha as regiões e diz de que lado de cada porta fica cada
uma, então a geometria repete, do seu jeito, qual estado leva a qual. Essa parte não é derivada da
δ: ela é **validada contra a δ** por `tests/mapa.test.js` (cada par estado/símbolo tem um tile, e
cada travessia sai na região do estado de destino). Mudar a δ sem ajustar o mapa faz esses testes
falharem. Os textos de enredo (descrições de estados, de símbolos e dos exemplos) também são
escritos à mão.

| Arquivo | Conteúdo |
|---|---|
| `index.html` | página única, só caminhos relativos |
| `css/style.css` | estilos; fontes do sistema, tema claro e escuro |
| `js/automato.js` | definição de M: estados, Σ, Γ, δ e os 4 exemplos |
| `js/pda.js` | motor genérico de PDA determinístico; não conhece o jogo nem o DOM |
| `js/mapa.js` | a grade, a região de cada tile e a posição de cada evento |
| `js/game.js` | personagem, toques em WASD, roteiro e tradução de evento em símbolo |
| `js/ui.js` | mapa, painel, fita, pilha, histórico, diagrama SVG e tabelas |
| `js/main.js` | liga tudo: teclado, botões, animações |
| `tools/gerar-jff.js` | gera `pda.jff` a partir de `js/automato.js` |
| `tools/conferir-jflap.js` | opcional: confere o `pda.jff` dentro do próprio JFLAP |
| `pda.jff` | o autômato no formato do JFLAP 7.1 (gerado, não editar) |
| `tests/` | testes em Node, sem dependências |

Não há dependências externas nem etapa de build.

---

## 6. Como executar

**Jogar localmente:** abra `index.html` no navegador (duplo clique funciona). Ou sirva a pasta:

```
python -m http.server 8000
```

e acesse `http://localhost:8000`.

**Regerar o arquivo do JFLAP** depois de mudar a δ:

```
node tools/gerar-jff.js
```

**Rodar os testes** (Node 18 ou mais novo, nada para instalar):

```
node --test
```

Os testes conferem que:

1. os 4 exemplos e mais 15 cadeias dão o resultado esperado, com o trace completo dos exemplos;
2. o autômato é determinístico e segue o enunciado (5 a 10 estados, Σ, Γ, entrada em qf por
   `λ, Z; λ`);
3. o `pda.jff`, relido do disco, tem exatamente a mesma δ do JavaScript;
4. o mapa concorda com a δ: cada par (estado, símbolo) tem um tile, e cada travessia leva à região
   do estado de destino, incluindo a escada da λ;
5. em partidas simuladas, a região da personagem é sempre o estado do autômato, tecla segurada não
   repete evento, o Modo Jogo bloqueia e o Modo Estrito rejeita;
6. os fluxos de `js/main.js` se comportam como descrito acima (`tests/main.test.js`): "Encerrar
   percurso" é ignorado durante um roteiro, "Passo a passo" trava depois do resultado, as setas só
   são do jogo com o foco no mapa, o texto "em andamento" acompanha cada passo e uma falha na
   animação não trava o teclado. O `main.js` roda sem alteração dentro de um contexto `vm`, com um
   DOM mínimo e um relógio virtual.

---

## 7. Como testar no JFLAP 7.1

1. `File ▸ Open` → `pda.jff`.
2. `Input ▸ Multiple Run`. Quando o JFLAP perguntar o modo de aceitação, escolha **Final State**.
3. Digite as cadeias abaixo, uma por linha, e clique em **Run Inputs**. A coluna *Result* deve
   bater com a tabela.
4. Para ver a pilha passo a passo: `Input ▸ Step with Closure`, Final State, e clique em **Step**.

| Cadeia | Resultado | Motivo |
|---|---|---|
| `*sabc` | Accept | rota da Gruta |
| `a*aabbscb` | Accept | rota da Ponte, contagem aninhada |
| `*asbac` | Reject | ordem errada: chave sobre a estrela |
| `a*sabc` | Reject | termina em q5 com uma chave: fora de F |
| `a*sabcb` | Accept | exemplo 4 corrigido: a chave vai para a urna |
| `*absc` | Accept | rota da Ponte mínima |
| `aa*sabcbb` | Accept | duas chaves antes da estrela, duas na urna |
| `aaa*aaabbbscbbb` | Accept | a³ * a³ b³ s c b³ |
| (vazia) | Reject | q0 não é final |
| `*` | Reject | para na Colina |
| `*b` | Reject | falta de chave no portão |
| `*saabc` | Reject | chave demais na Gruta |
| `**` | Reject | só existe uma estrela |
| `*sabcb` | Reject | símbolo depois de qf |
| `sabc` | Reject | sem estrela |
| `*sc` | Reject | o portal não fica na Gruta |
| `aa*sabcb` | Reject | duas chaves antes da estrela, uma na urna |
| `a*sabcbb` | Reject | uma chave antes da estrela, duas na urna |
| `*aabsc` | Reject | ponte fechada: ainda há chave sobre a estrela |

Observações sobre o arquivo:

- O JFLAP inicia a pilha com `Z`, que é o símbolo inicial de M.
- λ aparece no `.jff` como tag vazia (`<read/>`, `<pop/>`, `<push/>`).
- Transições como `a, Z; KZ` empilham dois símbolos. Isso funciona em arquivo aberto pelo
  `File ▸ Open`; a restrição de um caractere só existe quando se cria um PDA novo escolhendo
  "Single Character Input".
- Os estados podem ser arrastados à vontade; as posições salvas evitam aresta vertical saindo de
  estado com laço, porque o JFLAP desenha o laço sempre acima do estado.

Conferência automática opcional (precisa de um JDK com `jshell` no PATH):

```
node tools/conferir-jflap.js caminho/para/JFLAP7.1.jar
```

Ela abre o `pda.jff` com o leitor de arquivos do próprio JFLAP, roda o detector de não
determinismo dele e simula as 19 cadeias no simulador dele.

---

## 8. Como publicar no GitHub Pages

```
git remote add origin https://github.com/Victor-Casagrande/Estrela-do-Farol-PDA.git
git push -u origin main
```

Depois, no repositório: `Settings ▸ Pages ▸ Build and deployment ▸ Source: Deploy from a branch`,
branch `main`, pasta `/ (root)`, **Save**. Em um ou dois minutos a página fica em
`https://victor-casagrande.github.io/Estrela-do-Farol-PDA/`.
