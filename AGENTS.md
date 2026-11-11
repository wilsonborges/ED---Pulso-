# Projeto Codex — ED - Pulso

Este repositório contém o PWA estático ED - Pulso. Os arquivos do app ficam na raiz do repositório.

## Regras para alterações

- Preserve as funções existentes de cronômetros, alertas, intervenções, linha do tempo e geração/compartilhamento da evolução.
- Mantenha os caminhos de arquivos relativos (por exemplo, `./styles.css` e `./icons/...`) e `start_url`, `id` e `scope` relativos no manifesto. O app é publicado sob o caminho `/ED---Pulso-/` do GitHub Pages.
- Preserve as chaves existentes do `localStorage`, salvo quando o usuário pedir uma migração.
- Não inclua dados reais de pacientes, identificadores ou informações de prontuário em código, exemplos, commits ou logs.
- Evite dependências e etapas de build novas quando a alteração puder ser feita nos arquivos estáticos existentes.
- Quando o usuário pedir para aplicar e publicar uma alteração, faça a mudança neste repositório, revise o diff e envie o commit para `main`. O GitHub Pages publicará as atualizações automaticamente quando estiver configurado para a branch `main` e a pasta raiz.
- Ao concluir, informe quais arquivos foram alterados e o commit. Se a publicação estiver configurada, confira o resultado do deploy.
- Não altere visibilidade do repositório, permissões ou configurações de hospedagem sem solicitação explícita.
