<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-5 flex-wrap ga-3">
      <div>
        <h1 class="text-h5 font-weight-bold mb-1">Central de Ajuda</h1>
        <p class="text-body-2" style="color:#9FB0BC">Guias rápidos sobre cada área da plataforma</p>
      </div>
      <v-text-field
        v-model="search"
        placeholder="Buscar artigos, dúvidas, palavras-chave..."
        prepend-inner-icon="mdi-magnify"
        density="compact"
        hide-details
        clearable
        style="max-width:320px"
      />
    </div>

    <!-- ═══ CORPO: sidebar + conteúdo ═══ -->
    <div class="help-body">
      <aside class="help-sidebar">
        <span class="help-sidebar-label">CATEGORIAS</span>
        <button
          v-for="s in sections" :key="s.title"
          class="help-cat-item"
          :class="{ active: !search.trim() && activeCategory === s.title }"
          @click="selectCategory(s.title)"
        >
          <div class="help-cat-icon"><v-icon :icon="s.icon" size="16" /></div>
          <span class="help-cat-title">{{ s.title }}</span>
          <span class="help-cat-count">{{ s.items.length }}</span>
        </button>
      </aside>

      <main class="help-content">
        <template v-if="search.trim()">
          <div class="help-content-header">
            <span class="help-content-eyebrow">RESULTADOS</span>
            <h2 class="help-content-title">{{ flatMatches.length }} resultado(s) para "{{ search }}"</h2>
          </div>

          <div v-if="!flatMatches.length" class="help-empty">
            <v-icon icon="mdi-file-search-outline" size="48" style="opacity:.25" class="mb-3" />
            <p class="text-body-2" style="color:var(--text-muted)">Nenhum artigo encontrado. Tente outra palavra-chave.</p>
          </div>

          <div v-else class="help-panels">
            <div v-for="m in flatMatches" :key="m.category + m.q" class="faq-card" :class="{ open: isFaqOpen(m.category + m.q) }">
              <button class="faq-head" @click="toggleFaq(m.category + m.q)">
                <div>
                  <span class="help-result-cat">{{ m.category }}</span>
                  <div class="text-body-2 font-weight-bold">{{ m.q }}</div>
                </div>
                <v-icon icon="mdi-chevron-down" size="18" class="faq-chevron" />
              </button>
              <div class="faq-body-outer">
                <div class="faq-body-inner">
                  <div class="faq-body help-answer">{{ m.a }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="help-content-header">
            <span class="help-content-eyebrow">CATEGORIA</span>
            <h2 class="help-content-title">
              <v-icon :icon="activeSection.icon" size="20" color="primary" class="mr-1" />
              {{ activeSection.title }}
            </h2>
          </div>

          <div class="help-panels">
            <div v-for="item in activeSection.items" :key="item.q" class="faq-card" :class="{ open: isFaqOpen(item.q) }">
              <button class="faq-head" @click="toggleFaq(item.q)">
                <span class="text-body-2 font-weight-bold">{{ item.q }}</span>
                <v-icon icon="mdi-chevron-down" size="18" class="faq-chevron" />
              </button>
              <div class="faq-body-outer">
                <div class="faq-body-inner">
                  <div class="faq-body help-answer">{{ item.a }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </main>
    </div>

    <!-- ═══ SUPORTE: pedir ajuda / meus chamados ═══ -->
    <v-card class="glass pa-5 mt-6" border>
      <div class="d-flex align-center justify-space-between flex-wrap ga-3 mb-1">
        <div class="d-flex align-center ga-2">
          <v-icon icon="mdi-face-agent" size="22" style="opacity:.7" />
          <span class="text-subtitle-1 font-weight-bold">Suporte</span>
        </div>
        <v-btn color="primary" size="small" prepend-icon="mdi-plus" @click="openCreateDialog">Pedir ajuda</v-btn>
      </div>
      <p class="text-body-2 mb-4" style="color:var(--text-muted)">
        Não encontrou o que precisava? Abra um chamado e converse direto com o administrador da plataforma.
      </p>

      <div v-if="ticketsLoading" class="text-center py-4">
        <v-progress-circular indeterminate size="24" color="primary" />
      </div>
      <div v-else-if="!tickets.length" class="text-body-2" style="color:var(--text-faint)">
        Você ainda não abriu nenhum chamado.
      </div>
      <div v-else class="support-ticket-list">
        <button v-for="tk in tickets" :key="tk.id" class="support-ticket-item" @click="openTicket(tk)">
          <div>
            <span class="support-ticket-cat">{{ categoryLabel(tk.category) }}</span>
            <div v-if="tk.description" class="support-ticket-desc">{{ tk.description }}</div>
          </div>
          <v-chip :color="statusColor(tk.status)" size="x-small" variant="flat">{{ statusLabel(tk.status) }}</v-chip>
        </button>
      </div>
    </v-card>

    <!-- ─── Dialog: novo chamado ─── -->
    <v-dialog v-model="showCreateDialog" max-width="480">
      <v-card class="pa-2">
        <v-card-title>Pedir ajuda ao administrador</v-card-title>
        <v-card-text>
          <v-select
            v-model="createForm.category"
            :items="categoryOptions"
            item-title="label"
            item-value="value"
            label="Qual o assunto?"
            variant="outlined"
            density="comfortable"
          />
          <v-textarea
            v-model="createForm.description"
            label="Descreva o que está acontecendo (opcional)"
            variant="outlined"
            density="comfortable"
            rows="3"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCreateDialog = false">Cancelar</v-btn>
          <v-btn color="primary" :loading="creating" @click="submitCreateTicket">Abrir chamado</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ─── Dialog: chat do chamado ─── -->
    <v-dialog v-model="showChatDialog" max-width="520" scrollable>
      <v-card v-if="activeTicket" class="support-chat-card">
        <v-card-title class="d-flex align-center justify-space-between">
          <span>{{ categoryLabel(activeTicket.category) }}</span>
          <v-chip :color="statusColor(activeTicket.status)" size="x-small" variant="flat">{{ statusLabel(activeTicket.status) }}</v-chip>
        </v-card-title>
        <v-divider />
        <v-card-text class="support-chat-messages">
          <div v-if="!messages.length" class="text-body-2 text-center py-6" style="color:var(--text-faint)">
            Nenhuma mensagem ainda. Escreva abaixo para começar.
          </div>
          <div
            v-for="m in messages" :key="m.id"
            class="support-msg"
            :class="{ 'support-msg--owner': m.sender_type === 'owner' }"
          >
            <div class="support-msg-bubble">{{ m.text }}</div>
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-3">
          <template v-if="activeTicket.status !== 'closed'">
            <v-text-field
              v-model="newMessageText"
              placeholder="Digite sua mensagem..."
              variant="outlined"
              density="compact"
              hide-details
              @keyup.enter="sendMessage"
            />
            <v-btn icon="mdi-send" color="primary" variant="flat" :loading="sending" @click="sendMessage" />
          </template>
          <span v-else class="text-body-2" style="color:var(--text-faint)">Este chamado foi encerrado.</span>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">{{ snackbar.text }}</v-snackbar>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/services/api'

const route = useRoute()
const search = ref('')

const sections = [
  {
    title: 'Primeiros passos',
    icon: 'mdi-rocket-launch-outline',
    items: [
      { q: 'O que é a plataforma?', a: 'É uma central onde você atende e vende pelo WhatsApp, tudo em um só lugar. Você conecta o(s) número(s) de WhatsApp da empresa, conversa com seus clientes e leads pelo Chat, acompanha cada negociação visualmente no Kanban (um quadro tipo "funil de vendas") e ainda pode deixar uma Inteligência Artificial responder automaticamente ou montar fluxos de atendimento automático (Chat Flow), sem precisar programar nada.' },
      { q: 'Por onde eu começo?', a: '1) Conecte um número de WhatsApp em Canais — é o primeiro passo, sem ele nada chega nem sai da plataforma.\n2) Se quiser respostas automáticas, configure a IA em Config. da IA (isso é opcional, dá pra usar 100% manual também).\n3) No dia a dia, acompanhe as conversas em Chat e veja o andamento de cada negociação em Kanban.\n4) Use Templates para não digitar a mesma resposta toda hora, e Broadcast quando quiser enviar uma campanha para vários contatos de uma vez.' },
      { q: 'O que aparece no Dashboard?', a: 'É a tela inicial com o resumo do dia da sua operação: quantas conversas foram abertas, quantos leads novos entraram, quantas reuniões foram agendadas e outros números de desempenho, em cartões e gráficos fáceis de entender. Também tem um botão para gerar e baixar um relatório do dia em arquivo, caso você precise compartilhar esses números com alguém.' },
    ],
  },
  {
    title: 'Canais & WhatsApp',
    icon: 'mdi-cellphone-wireless',
    items: [
      { q: 'Como conecto um número de WhatsApp?', a: 'Vá no menu Canais e clique em "Novo Canal". Existem duas formas de conectar, dependendo do que estiver disponível para sua conta:\n• Evolution: você escaneia um QR Code com o WhatsApp do celular (igual conectar o WhatsApp Web) — mais rápido de configurar.\n• Meta API: é a forma oficial do WhatsApp Business, exige um cadastro prévio na Meta, mas é mais estável para grandes volumes de mensagem.\nSe tiver dúvida sobre qual usar, fale com o administrador da sua operação.' },
      { q: 'Posso ter mais de um canal conectado?', a: 'Sim, sem limite definido pela tela — você pode conectar vários números de WhatsApp ao mesmo tempo, um para cada equipe, loja ou finalidade, por exemplo. Cada canal aparece como um card separado em Canais, onde dá pra renomear o canal, ver quantos atendimentos (tickets) estão em aberto por ele, ou excluí-lo quando não for mais usar.' },
      { q: 'O que fazer se um canal cair ou desconectar?', a: 'Isso acontece às vezes com o WhatsApp normal (ex: o celular ficou sem internet, ou a sessão expirou). Vá em Canais, encontre o canal marcado como desconectado e refaça a conexão — no caso do Evolution, basta escanear um novo QR Code. Se o canal continuar caindo ou não reconectar, verifique a configuração correspondente na tela de Integrações, ou peça ajuda ao administrador.' },
    ],
  },
  {
    title: 'Chat & Atendimento',
    icon: 'mdi-chat-outline',
    items: [
      { q: 'Como falo com um lead que ainda não me chamou?', a: 'No Chat, clique no botão "Iniciar Conversa Avulsa". Informe o número de telefone com o DDD (ex: 11 99999-9999) e, se quiser, já escreva a primeira mensagem que será enviada assim que a conversa for criada.' },
      { q: 'Como transfiro um atendimento para outro operador?', a: 'Abra a conversa do lead no Chat, clique na opção "Transferir Atendimento" e escolha para qual operador (pessoa) ou fila (grupo de atendimento) você quer mandar aquela conversa. A pessoa que receber vai ver o atendimento aparecer na lista dela.' },
      { q: 'O que são filas e etiquetas?', a: 'Ficam configuradas na tela de Atendimento, dividida em três abas:\n• Etiquetas: marcadores coloridos que você cria para classificar conversas (ex: "Urgente", "Financeiro", "Suporte"), facilitando encontrar depois.\n• Filas: grupos de atendimento (ex: "Vendas", "Suporte técnico") para organizar quem cuida de quê.\n• Horário: define o horário de funcionamento da equipe, usado para avisar o lead quando ele escrever fora do expediente.' },
      { q: 'Dá para excluir conversas?', a: 'Sim. Na lista de conversas do Chat, selecione uma ou mais conversas e use a opção de excluir/deletar. Essa ação remove a conversa da lista — use com cuidado, pois o histórico daquele atendimento deixa de ficar visível.' },
      { q: 'Como respondo a uma mensagem específica?', a: 'Dentro de uma conversa, passe o mouse sobre a mensagem que você quer responder e clique no ícone de seta (responder) que aparece. Um resumo da mensagem original fica destacado acima da caixa de digitação — assim como acontece no WhatsApp normal — para deixar claro a qual mensagem você está respondendo antes de enviar.' },
      { q: 'A IA entende áudios que o lead envia?', a: 'Sim. Sempre que um lead manda um áudio (mensagem de voz), a plataforma transcreve esse áudio para texto automaticamente e de forma quase instantânea. Esse texto aparece na conversa como se fosse uma mensagem escrita, e é isso que a IA "lê" para conseguir entender e responder o que a pessoa falou — você não precisa ouvir o áudio manualmente para saber o que foi dito.' },
    ],
  },
  {
    title: 'Acompanhamentos',
    icon: 'mdi-timeline-clock-outline',
    items: [
      { q: 'O que é um Acompanhamento?', a: 'É uma forma de deixar mensagens programadas para serem enviadas automaticamente a um contato, com o tempo. Serve, por exemplo, para lembrar um lead de uma proposta em aberto, cobrar uma resposta educadamente depois de alguns dias, ou manter contato mesmo sem um atendente precisar lembrar disso manualmente. Você monta a sequência de mensagens uma única vez e pode reaproveitá-la em quantos leads quiser.' },
      { q: 'Como crio uma sequência de acompanhamento?', a: 'Vá em Acompanhamentos e clique em "Novo Acompanhamento". Dê um nome para identificar a sequência (ex: "Follow-up de proposta") e, se quiser, uma descrição. Depois, adicione as mensagens uma por uma clicando em "Adicionar mensagem": para cada uma você escreve o texto, pode anexar um arquivo (imagem, PDF, etc.) e define quando ela deve ser enviada — imediatamente ou depois de um número de dias a partir do início do acompanhamento. Dá para arrastar as mensagens para reordenar a sequência.' },
      { q: 'Como inicio um acompanhamento para um lead?', a: 'Abra a conversa do lead no Chat e clique no botão "Iniciar Acompanhamento". Escolha qual sequência (das que você já criou) deseja aplicar àquele contato. A partir daí, as mensagens da sequência começam a ser enviadas automaticamente nos prazos configurados, e você acompanha o progresso (em qual etapa está e quando será o próximo envio) direto na lateral daquela conversa.' },
      { q: 'Dá para reiniciar, finalizar ou cancelar um acompanhamento em andamento?', a: 'Sim. No card "Acompanhamento ativo", dentro da conversa do lead, você tem três botões:\n• Reiniciar: volta a sequência para a primeira mensagem, como se estivesse começando de novo.\n• Finalizar: encerra o acompanhamento marcando como concluído (use quando o objetivo foi alcançado).\n• Cancelar: interrompe o envio das mensagens restantes sem marcar como concluído.' },
      { q: 'Posso duplicar uma sequência já criada?', a: 'Sim. Na lista de Acompanhamentos, clique no ícone de duplicar ao lado da sequência desejada. Isso cria uma cópia idêntica, que você pode editar livremente (mudar textos, prazos, etc.) sem alterar ou perder a sequência original.' },
    ],
  },
  {
    title: 'Kanban & Leads',
    icon: 'mdi-view-column-outline',
    items: [
      { q: 'Para que serve o Kanban?', a: 'É o seu funil de vendas em forma de quadro visual (também chamado de CRM Kanban). Cada card representa um lead (um cliente em potencial), e as colunas representam as etapas da negociação (ex: "Novo", "Em conversa", "Proposta enviada", "Fechado"). Basta arrastar o card de uma coluna para outra conforme o lead avança — ou volta — na negociação, e clicar em um card abre os detalhes completos daquele lead.' },
      { q: 'O que é o "score de qualificação"?', a: 'É uma nota de 0 a 100 calculada para cada lead, indicando o quão "quente" ou preparado para comprar ele parece estar, com base nas informações e conversas que já teve. Quanto maior o score, mais prioridade esse lead deve ter na hora de decidir quem atender primeiro.' },
      { q: 'Qual a diferença entre Leads e Contatos?', a: 'Leads são as negociações em andamento — pessoas que já entraram no funil de vendas e aparecem como cards no Kanban. Contatos é a sua base geral e mais ampla de pessoas e telefones (inclusive quem ainda não virou lead), usada por exemplo para importar listas inteiras ou para escolher quem vai receber uma campanha de Broadcast.' },
    ],
  },
  {
    title: 'Contatos & Grupos',
    icon: 'mdi-contacts-outline',
    items: [
      { q: 'Como importo minha lista de contatos?', a: 'Na tela de Contatos, clique no botão "Importar" e envie uma planilha (CSV) com os dados dos seus contatos, como nome e telefone. Todos entrarão na sua base de Contatos de uma só vez, prontos para receber mensagens ou campanhas de Broadcast.' },
      { q: 'Dá para exportar meus contatos ou remover duplicados?', a: 'Sim, os dois na mesma tela de Contatos:\n• Exportar: baixa toda a sua lista de contatos em um arquivo, útil para backup ou para usar em outra ferramenta.\n• Remover duplicados: a plataforma verifica e junta automaticamente contatos repetidos (ex: o mesmo telefone cadastrado duas vezes), mantendo sua base organizada.' },
      { q: 'O que são os Grupos internos?', a: 'É uma forma de organizar contatos da sua própria equipe ou uso interno (que não são leads/clientes) em grupos separados, dentro da tela de Grupos. Isso mantém sua base de leads e clientes limpa, sem misturar com contatos que são só de uso interno da empresa.' },
    ],
  },
  {
    title: 'Agenda',
    icon: 'mdi-calendar-clock-outline',
    items: [
      { q: 'A Agenda sincroniza com o Google Calendar?', a: 'Sim, mas antes é preciso conectar essa integração: vá em Integrações e siga o passo a passo para autorizar sua conta do Google. Depois disso, toda reunião marcada com um lead (seja manualmente ou pela própria IA) aparece automaticamente também no seu Google Calendar, já com um link de videochamada do Google Meet gerado.' },
      { q: 'Como vejo os compromissos do mês?', a: 'A tela de Agenda mostra um calendário mensal completo. Basta navegar entre os meses e clicar em um dia para ver a lista de reuniões e compromissos marcados com leads naquele período.' },
    ],
  },
  {
    title: 'Templates & Broadcast',
    icon: 'mdi-file-document-multiple-outline',
    items: [
      { q: 'Como uso variáveis nos templates?', a: 'Ao criar ou editar um template em Templates, use chaves duplas ao redor do nome do dado que você quer inserir automaticamente, por exemplo {{nome}}. Na hora de enviar, a plataforma substitui essa variável pelo dado real daquele lead (ex: {{nome}} vira "João"), sem você precisar reescrever a mensagem toda vez.' },
      { q: 'Dá para testar um template antes de usar?', a: 'Sim. No card do template, clique no botão "Testar". Você informa um contexto de exemplo (como se fosse um lead fictício) e a IA gera uma prévia de como a mensagem ficaria pronta, para você conferir se está tudo certo antes de usar de verdade com clientes reais.' },
      { q: 'Como funciona o Broadcast?', a: 'Em Broadcast você cria campanhas de envio em massa: escolhe uma mensagem (ou template) e uma lista de contatos, e a plataforma envia para todos automaticamente. Depois, você acompanha em tempo real quantas mensagens foram enviadas, entregues, lidas pelo contato e respondidas — tudo em uma única tela de acompanhamento da campanha.' },
    ],
  },
  {
    title: 'Chat Flow (automação)',
    icon: 'mdi-robot-outline',
    items: [
      { q: 'O que é o Chat Flow?', a: 'É um construtor visual de atendimento automático, no estilo "monte seu próprio robô de conversa" sem precisar programar. Você cria "nós" (caixinhas) de mensagens, perguntas com opções de resposta e condições, e conecta esses nós com linhas para desenhar o caminho que a conversa deve seguir — por exemplo, perguntar o motivo do contato e, dependendo da resposta, direcionar para um atendente diferente.' },
      { q: 'Como crio um novo fluxo?', a: 'Vá em Chat Flow e clique em "Novo Fluxo". Isso abre o editor visual, onde você adiciona nós de mensagem e de opções, conecta-os na ordem em que a conversa deve acontecer e pode definir palavras-chave que, quando digitadas pelo lead, disparam esse fluxo automaticamente. Depois de pronto, ative o fluxo para que ele passe a funcionar nas conversas reais (ele também pode ser pausado a qualquer momento).' },
    ],
  },
  {
    title: 'Inteligência Artificial',
    icon: 'mdi-robot-happy-outline',
    items: [
      { q: 'Como ligo/desligo a IA?', a: 'Use o botão "IA Ativada/Desativada" no menu lateral da plataforma. Com a IA ativada, ela responde automaticamente aos leads seguindo as instruções configuradas. Com a IA desativada, todas as respostas passam a depender 100% dos operadores humanos — útil para os momentos em que você prefere um controle totalmente manual do atendimento.' },
      { q: 'O que configuro em Config. da IA?', a: 'Nessa tela você define a "personalidade" do seu assistente: o nome dele, o tom de voz (mais formal ou descontraído, por exemplo), o Prompt de Sistema (regras gerais de comportamento que ele sempre deve seguir) e o Prompt Principal (informações do seu negócio, como produtos, preços e diferenciais, que ele deve usar para responder). Há também um botão para testar a IA com uma pergunta antes de publicar as alterações de verdade.' },
      { q: 'Como a IA consulta documentos da minha empresa?', a: 'Ainda em Config. da IA, na seção "Base de Conhecimento", você pode enviar um arquivo com o catálogo de produtos ou serviços da empresa — nos formatos PDF, XLSX (Excel), CSV ou TXT. A partir do envio, a IA passa a consultar o conteúdo desse documento para responder perguntas com mais precisão, sem você precisar copiar tudo manualmente para o Prompt Principal. Atenção: se o documento for muito extenso, apenas os primeiros 15.000 caracteres são considerados pela IA.' },
      { q: 'A IA escuta os áudios enviados pelo lead?', a: 'Sim. Assim como no Chat, todo áudio recebido de um lead é transcrito automaticamente em texto assim que chega (usando uma tecnologia de reconhecimento de voz chamada Whisper), e é esse texto que a IA usa para entender o que a pessoa disse e formular a resposta.' },
    ],
  },
  {
    title: 'Usuários & Permissões',
    icon: 'mdi-account-group-outline',
    items: [
      { q: 'Como adiciono um novo operador?', a: 'Na tela de Usuários, clique em "Novo Usuário" e preencha os dados de acesso dele (nome, e-mail, senha inicial e se será "Admin" ou "Atendente"). Depois de criado, você ainda pode redefinir a senha desse usuário a qualquer momento, editar seus dados, marcá-lo como restrito, ou excluí-lo quando ele não fizer mais parte da equipe.' },
      { q: 'Qual a diferença entre Admin e Atendente?', a: 'Admin tem acesso completo à plataforma, incluindo criar/editar outros usuários e mexer nas configurações gerais. Atendente é o operador do dia a dia, focado em atender conversas, sem acesso às configurações administrativas. Também existe a opção de marcar um usuário como "restrito", que limita ainda mais o que ele pode ver ou fazer.' },
      { q: 'Consigo ver o desempenho de cada operador?', a: 'Sim. Na tela de Usuários, clique na aba "Dashboard" para ver, por operador, um resumo com mensagens enviadas, leads criados, reuniões/agendamentos feitos e quantos atendimentos foram assumidos manualmente por ele — útil para acompanhar a produtividade da equipe.' },
    ],
  },
  {
    title: 'Integrações & Configurações',
    icon: 'mdi-puzzle-outline',
    items: [
      { q: 'Quais integrações estão disponíveis?', a: 'Na tela de Integrações você encontra: Google Calendar (sincroniza reuniões com a agenda do Google e gera link de Meet automaticamente), WhatsApp via Meta API (canal oficial do WhatsApp Business) e WhatsApp via Evolution (conexão por QR Code). Cada uma tem seu próprio passo a passo de configuração na mesma tela.' },
      { q: 'Como conecto o Google Calendar?', a: 'Em Integrações, siga os dois passos indicados: Passo 1 — crie um projeto em console.cloud.google.com, ative a API do Google Calendar e gere as credenciais OAuth (um Client ID e um Client Secret), colando-os na plataforma. Passo 2 — clique em "Conectar Google Calendar" e autorize sua conta Google. Esse passo costuma ser feito pelo administrador da operação, já que exige acesso ao painel do Google.' },
      { q: 'Para que servem as APIs Customizadas?', a: 'É uma tela mais técnica, pensada para conectar provedores externos de IA (além dos já disponíveis) ou chamadas HTTP para sistemas próprios da empresa, permitindo integrar a plataforma com ferramentas internas específicas do seu negócio. Normalmente configurada com apoio técnico.' },
      { q: 'Onde altero idioma, senha e dados da empresa?', a: 'Na tela de Configurações você edita os dados cadastrais da empresa, troca sua senha de acesso e escolhe o idioma da interface da plataforma.' },
      { q: 'O que tem em Operação?', a: 'É a tela de "Configurações Operacionais", com ajustes mais avançados de comportamento do atendimento, como: encerramento automático de tickets por inatividade (e a mensagem enviada nesse caso), carência para reabrir um ticket recém-fechado com o mesmo agente, exigir que o operador informe um motivo ao encerrar uma conversa, além de permissões de visibilidade entre operadores e regras de comportamento do bot.' },
    ],
  },
]

const activeCategory = ref(sections[0].title)
const activeSection = computed(() => sections.find((s) => s.title === activeCategory.value) || sections[0])
function selectCategory(title) { activeCategory.value = title; search.value = '' }

const flatMatches = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return []
  return sections.flatMap((s) => s.items.filter((i) => (i.q + ' ' + i.a).toLowerCase().includes(q)).map((i) => ({ ...i, category: s.title })))
})

// abre/fecha cada pergunta no lugar (mesma animação usada no resto do app)
const openFaqs = ref(new Set())
function toggleFaq(key) {
  const next = new Set(openFaqs.value)
  next.has(key) ? next.delete(key) : next.add(key)
  openFaqs.value = next
}
function isFaqOpen(key) { return openFaqs.value.has(key) }
watch([activeCategory, search], () => { openFaqs.value = new Set() })

// ═══ Suporte (chamados) ═══
const categoryOptions = [
  { value: 'tecnico', label: 'Problema técnico / erro na plataforma' },
  { value: 'duvida', label: 'Dúvida sobre como usar' },
  { value: 'whatsapp', label: 'Problema de conexão do WhatsApp' },
  { value: 'financeiro', label: 'Cobrança / financeiro' },
  { value: 'sugestao', label: 'Sugestão de melhoria' },
  { value: 'outro', label: 'Outro' },
]
function categoryLabel(value) { return categoryOptions.find((c) => c.value === value)?.label || value }
function statusLabel(status) { return { open: 'Aguardando', in_progress: 'Em atendimento', closed: 'Encerrado' }[status] || status }
function statusColor(status) { return { open: 'warning', in_progress: 'info', closed: 'default' }[status] || 'default' }

const tickets = ref([])
const ticketsLoading = ref(false)
const snackbar = ref({ show: false, text: '', color: 'error' })
function notify(text, color = 'error') { snackbar.value = { show: true, text, color } }

async function loadTickets() {
  ticketsLoading.value = true
  try {
    tickets.value = await api.listSupportTickets()
    // veio do sino (NotificationBell) com um chamado específico pra abrir
    if (route.query.ticket) {
      const target = tickets.value.find((t) => t.id === route.query.ticket)
      if (target) openTicket(target)
    }
  } catch {
    notify('Não foi possível carregar seus chamados.')
  } finally {
    ticketsLoading.value = false
  }
}

const showCreateDialog = ref(false)
const creating = ref(false)
const createForm = ref({ category: 'duvida', description: '' })
function openCreateDialog() {
  createForm.value = { category: 'duvida', description: '' }
  showCreateDialog.value = true
}
async function submitCreateTicket() {
  creating.value = true
  try {
    const ticket = await api.createSupportTicket(createForm.value)
    tickets.value.unshift(ticket)
    showCreateDialog.value = false
    openTicket(ticket)
  } catch {
    notify('Não foi possível abrir o chamado. Tente novamente.')
  } finally {
    creating.value = false
  }
}

const showChatDialog = ref(false)
const activeTicket = ref(null)
const messages = ref([])
const newMessageText = ref('')
const sending = ref(false)
let pollInterval = null

async function loadMessages() {
  if (!activeTicket.value) return
  try {
    messages.value = await api.getSupportMessages(activeTicket.value.id)
  } catch {
    // silencioso — próximo poll tenta de novo
  }
}

function openTicket(ticket) {
  activeTicket.value = ticket
  showChatDialog.value = true
  messages.value = []
  loadMessages()
  stopPolling()
  pollInterval = setInterval(loadMessages, 4000)
}

async function sendMessage() {
  const text = newMessageText.value.trim()
  if (!text || !activeTicket.value) return
  sending.value = true
  try {
    const msg = await api.sendSupportMessage(activeTicket.value.id, text)
    messages.value.push(msg)
    newMessageText.value = ''
  } catch {
    notify('Não foi possível enviar a mensagem.')
  } finally {
    sending.value = false
  }
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null }
}
watch(showChatDialog, (open) => { if (!open) stopPolling() })

onMounted(loadTickets)
onUnmounted(stopPolling)
</script>

<style scoped>
/* ─── Corpo ─── */
.help-body { display: flex; align-items: flex-start; gap: 20px; }

.help-sidebar {
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: 0;
}
.help-sidebar-label {
  font-size: 10px; font-weight: 700; letter-spacing: 1px;
  color: var(--text-faint);
  padding: 0 10px 8px;
}
.help-cat-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 10px;
  background: none; border: none; cursor: pointer;
  text-align: left; color: var(--text-muted);
  transition: all 0.15s ease;
}
.help-cat-item:hover { background: var(--panel-hover); color: var(--text-primary); }
.help-cat-item.active { background: rgba(99,102,241,0.12); color: #818CF8; }
.help-cat-icon {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--panel-bg);
}
.help-cat-item.active .help-cat-icon { background: rgba(99,102,241,0.2); color: #818CF8; }
.help-cat-title { font-size: 13px; font-weight: 500; flex: 1; }
.help-cat-count {
  font-size: 11px; font-weight: 600; color: var(--text-faint);
  background: var(--panel-bg); border-radius: 20px; padding: 1px 7px;
}

.help-content { flex: 1; min-width: 0; }
.help-content-header { margin-bottom: 12px; }
.help-content-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1px; color: var(--text-faint); }
.help-content-title { font-size: 18px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; margin-top: 2px; }

.help-panels { display: flex; flex-direction: column; gap: 8px; }
.help-answer { color: var(--text-muted); white-space: pre-line; }
.help-result-cat {
  display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .5px;
  color: #818CF8; background: rgba(99,102,241,0.12);
  border-radius: 6px; padding: 1px 7px; margin-bottom: 4px;
}
.help-empty { text-align: center; padding: 48px 16px; }

/* ─── Card de pergunta/resposta (expande/recolhe no lugar) ─── */
.faq-card {
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  overflow: hidden;
  background: var(--panel-bg);
}
.faq-head {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 16px;
  background: none; border: none; cursor: pointer; text-align: left;
  font: inherit; color: inherit;
}
.faq-head:hover { background: var(--panel-hover); }
.faq-chevron { flex-shrink: 0; color: var(--text-muted); transition: transform .32s cubic-bezier(.4,0,.2,1); }
.faq-card.open .faq-chevron { transform: rotate(180deg); }
.faq-body-outer {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .32s cubic-bezier(.4,0,.2,1);
}
.faq-card.open .faq-body-outer { grid-template-rows: 1fr; }
.faq-body-inner { overflow: hidden; }
.faq-body { padding: 0 16px 16px; }

/* ─── Suporte ─── */
.support-ticket-list { display: flex; flex-direction: column; gap: 6px; }
.support-ticket-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border-radius: 10px;
  background: var(--panel-bg); border: 1px solid var(--border-subtle);
  cursor: pointer; text-align: left; width: 100%;
  transition: background 0.12s;
}
.support-ticket-item:hover { background: var(--panel-hover); }
.support-ticket-cat { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.support-ticket-desc {
  font-size: 12px; color: var(--text-muted); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;
}

.support-chat-messages { max-height: 360px; min-height: 160px; overflow-y: auto; padding: 16px !important; }
.support-msg { display: flex; margin-bottom: 8px; }
.support-msg--owner { justify-content: flex-end; }
.support-msg-bubble {
  max-width: 80%; padding: 8px 12px; border-radius: 12px;
  background: var(--panel-bg); font-size: 13px; color: var(--text-primary);
  white-space: pre-wrap; word-break: break-word;
}
.support-msg--owner .support-msg-bubble { background: rgba(99,102,241,0.18); }

/* ─── Mobile ─── */
@media (max-width: 900px) {
  .help-body { flex-direction: column; }
  .help-sidebar {
    flex-direction: row;
    overflow-x: auto;
    width: 100%;
    position: static;
    gap: 6px;
    padding-bottom: 4px;
  }
  .help-sidebar-label { display: none; }
  .help-cat-item { flex-shrink: 0; }
  .help-cat-title { white-space: nowrap; }
}
</style>
