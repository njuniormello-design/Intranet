const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_PASSWORD = 'mudar@26';
const DEFAULT_ROLE = 'viewer';

const rawUsers = `
26;Adolfo Oldemburgo;Gerente de Tecnologia, inovação e infraestrutura;Diretoria de Operações;adolfo.oldemburgo@iluminacao.net.br;2778
4;Anderson Vido;Coordenador de Segurança do Trabalho;Gestão de Pessoas;anderson.vido@iluminacao.net.br;2774
5;Agnaldo Pereira de Oliveira;Agente Eletricista;Operações;;2771
6;Antonio Ferreira Neto;Assistente Operacional;Gestão de Estoque e Suprimentos;antonio.neto@iluminacao.net.br;2779
168;Artur Adolfo Falkovski;Engenheiro Eletricista;Planejamento e Projetos;artur.falkovski@iluminacao.net.br;2794
73;Augusto Cesar de Campos Soares;Coordenador De Drones;Planejamento e Projetos;augusto.soares@iluminacao.net.br;2754
218;Beatriz Borges da Silva;Estagiária;Gestão de Estoque e Suprimentos;beatriz.silva@iluminacao.net.br;2784
209;Camila Aguiar da Cruz;Estagiária;Gestão de Licitações e Contratos;camila.cruz@iluminacao.net.br;2795
96;Cezar Pereira dos Santos;Auditor Interno;Contabilidade;cezar.santos@iluminacao.net.br;2762
44;Daniele Aparecida dos Santos;Gerente Financeira;Financeiro;daniele.santos@iluminacao.net.br;2758
80;Debora Alves Inumaru;Gerente de Licitações e Contratos;Gestão de Licitações e Contratos;debora.inumaru@iluminacao.net.br;2757
194;Denise Martins do Amaral Silva;Estagiária;Contabilidade;denise.silva@iluminacao.net.br;2760
197;Diego Pereira da Costa Prazeres;Assessor de Diretoria e Presidência;Presidência;diego.prazeres@iluminacao.net.br;2764
8;Edson Alves da Silva Junior;Coordenador de Serralheria;Operações;edson.junior@iluminacao.net.br;2767
191;Eduardo Stoeberl Bertolla Sandi;Estagiário;Planejamento e Projetos;eduardo.sandi@iluminacao.net.br;2796
9;Elias Pacheco de Andrade;Coordenador de Operações;Operações;elias.andrade@iluminacao.net.br;2772
10;Elizeu dos Santos Junior;Agente Eletricista;Operações;;2771
205;Erica Cristina Pega de Oliveira;Agente de Contratação/Pregoeiro;Gestão de Licitações e Contratos;erica.oliveira@iluminacao.net.br;2769
11;Fabio Moraes Caetano;Agente Eletricista;Operações;;2771
60;Fernando Martins;Agente Eletricista;Operações;fernando.martins@iluminacao.net.br;2771
106;Fernando Rodrigues da Cruz;Coordenador de Pesquisa e Desenvolvimento;Gestão de Tecnologia, Inovação e Infraestrutura;fernando.cruz@iluminacao.net.br;2777
13;Filipe Alves Gil;Agente Eletricista;Operações;;2771
196;Gabriel Fernando Pereira Carneiro;Aprendiz;Gestão de Licitações e Contratos;gabriel.carneiro@iluminacao.net.br;2776
27;Guilherme Akio Hayasaka;Responsável Tec Engenharia;Operações;guilherme.hayasaka@iluminacao.net.br;2773
14;Guilherme dos Santos Costa;Agente Eletricista;Operações;;2771
219;Guilherme Meranca D'Avila;Estagiário;Gestão de Estoque e Suprimentos;guilherme.meranca@iluminacao.net.br;
213;Gustavo Felix de Jesus;Jovem Aprendiz;Gestão de Pessoas;gustavo.jesus@iluminacao.net.br;2770
202;Gustavo Oliveira Leme;Assessor de Diretoria e Presidência;Presidência;gustavo.leme@iluminacao.net.br;2789
28;Helder Rafael Cavalcante de Oliveira;Gerente de Operações;Operações;helder.oliveira@iluminacao.net.br;2771
206;Henrique Hiroshi Kikuchi;Agente Adm e Financeiro;Operações;henrique.kikuchi@iluminacao.net.br;2797
43;Hercilia Setsuko Kajimoto;Técnica Contábil;Gestão de Pessoas;hercilia.kajimoto@iluminacao.net.br;2759
94;Jhonatan Luis Nunes ;Gerente de Contabilidade;Contabilidade;jhonatan.nunes@iluminacao.net.br;2780
16;João Gabriel Germanovix de Sousa Ferreira;Agente Eletricista;Operações;;2771
178;João Victor Pedrosa Marcolini;Agente Adm e Financeiro;Gestão de Estoque e Suprimentos;joao.marcolini@iluminacao.net.br;2785
217;Jonatan Guttler Freitas;Agente Eletricista;Operações;;2771
29;José Milton Puga Neto;Téc Eletrotécnico;Operações;jose.neto@iluminacao.net.br;2765
211;Kamila Fernanda dos Santos Souza;Estagiária;Contabilidade;kamila.souza@iluminacao.net.br;2791
35;Karen Larissa Santos Balarin Ambrosio;Coordenadora de Licitações e Contratos;Gestão de Licitações e Contratos;karen.balarin@iluminacao.net.br;2755
215;Lenise Dallmann Haber;Agente Adm e Financeiro;Gestão de Licitações e Contratos;lenise.haber@iluminacao.net.br;2793
192;Leonilda Aparecida Piras Goulart Der Bedrossian;Assessora de Diretoria e Presidência;Gestão de Licitações e Contratos;leonilda.bedrossian@iluminacao.net.br;2792
19;Luciano Aparecido dos Santos;Agente Eletricista;Operações;;2771
59;Luiz Carlos Biz;Agente Eletricista;Operações;;2771
111;Luiz Henrique Pistori;Agente Eletricista;Operações;;2771
110;Luiz Henrique Tamos de Carvalho;Agente Eletricista;Operações;;2771
57;Maicon Martins de Oliveira;Agente Eletricista;Operações;;2771
33;Marcela de Oliveira Ribeiro;Gerente de Planejamento e Projetos;Planejamento e Projetos;marcela.ribeiro@iluminacao.net.br;2751
109;Marcelo Neves Alda;Agente Eletricista;Operações;;2771
92;Marcelo Willians Tomaz;Assist. Operacional;Operações;marcelo.tomaz@iluminacao.net.br;2767
118;Marcia Suemi Utiyama;Agente Adm e Financeiro;Gestão de Estoque e Suprimentos;marcia.utiyama@iluminacao.net.br;2766
20;Marcos Antonio Bottine;Coordenador de Operações;Operações;marcos.bottine@iluminacao.net.br;2761
214;Maria Gabriela Stasiak de Freitas;Aprendiz;Gestão de Estoque e Suprimentos;maria.freitas@iluminacao.net.br;2784
199;Miriam Melo de Campos;Agente Adm e Financeiro;Gestão de Estoque e Suprimentos;miriam.campos@iluminacao.net.br;2782
169;Nara Hitomi Lodi Daikuhara;Assistente Operacional;Governança Corporativa;nara.daikuhara@iluminacao.net.br;2753
221;Nelson De Melo Teixeira Junior;Técnico de TI;Gerência de Tecnologia, inovação e infraestrutura;nelson.junior@iluminacao.net.br;2799
207;Paulo Arcoverde Nascimento;Assessor de Diretoria e Presidência;Presidência;paulo.arcoverde@iluminacao.net.br;2768
198;Paulo Sergio Moura;Diretor Adm e Financeiro;Diretoria ADM Financeira;paulo.moura@iluminacao.net.br;2788
195;Renan Vinicius Salvador;Diretor Presidente;Presidência;renan.salvador@iluminacao.net.br;2786
107;Roberto Marcelino Lopes;Agente Eletricista;Operações;;2771
58;Robson Weslley de Oliveira;Assist. Lab. Iluminação Públic;Operações;robson.oliveira@iluminacao.net.br;2787
177;Taynara Ribeiro Eleutério;Agente de Contratação/Pregoeiro;Gestão de Licitações e Contratos;taynara.eleuterio@iluminacao.net.br;2783
91;Thiago Dantas Carballal;Agente Eletricista;Operações;;2771
23;Tiago Antunes Ferreira;Agente Eletricista;Operações;;2771
24;Uandre Vicente de Medeiros;Assistente Operacional;Gerência de Tecnologia, inovação e infraestrutura;uandre.medeiros@iluminacao.net.br;2763
38;Ulisses Fernando de Paulo;Gerente de Gestão de Pessoas;Gestão de Pessoas;ulisses.paulo@iluminacao.net.br;2756
200;Vitor Daniel Genovez Horita;Diretor de Operações;Diretoria de Operações;vitor.horita@iluminacao.net.br;2790
193;Wagner Seiki Oguido;Agente de Contratação/Pregoeiro;Gestão de Licitações e Contratos;wagner.oguido@iluminacao.net.br;2775
25;Wagner Yoshihito Nishi;Coordenador de Operações;Operações;wagner.nishi@iluminacao.net.br;2752
108;Weslley Santos Barbosa;Agente Eletricista;Operações;;2771
90;Yuri Val Jordao Gomes;Agente Eletricista;Operações;;2771
95;Zenobio Sales Pinheiro Junior;Gerente de Estoque e Suprimentos;Gestão de Estoque e Suprimentos;zenobio.pinheiro@iluminacao.net.br;2781
`;

function parseUsers() {
  return rawUsers
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [re, name, cargo, department, email, ramal] = line.split(';').map((value) => value.trim());
      const normalizedEmail = email.toLowerCase();
      return {
        re,
        name,
        cargo,
        department,
        email: normalizedEmail,
        ramal,
        username: normalizedEmail ? normalizedEmail.split('@')[0] : ''
      };
    });
}

async function main() {
  const users = parseUsers();
  const usersWithEmail = users.filter((user) => user.email);
  const skippedUsers = users.filter((user) => !user.email);
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

  try {
    const rows = usersWithEmail.map((user) => [
      user.username,
      user.email,
      hashedPassword,
      user.name,
      user.department,
      DEFAULT_ROLE
    ]);

    await connection.query(
      `INSERT INTO users (username, email, password, name, department, role)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         email = VALUES(email),
         name = VALUES(name),
         department = VALUES(department),
         role = role,
         updated_at = NOW()`,
      [rows]
    );

    console.log(`Usuarios importados/atualizados: ${usersWithEmail.length}`);
    console.log(`Usuarios ignorados por falta de email: ${skippedUsers.length}`);
    if (skippedUsers.length) {
      console.log(skippedUsers.map((user) => `- RE ${user.re}: ${user.name}`).join('\n'));
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Erro ao importar usuarios:', error.message);
  process.exit(1);
});
