// API Handler para excluir comentário
const fs = require('fs');
const path = require('path');

// Na Vercel, só podemos escrever em /tmp
// Para produção, considere usar um banco de dados (ex: Supabase, MongoDB, etc.)
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const ARQUIVO_DADOS = IS_VERCEL 
    ? path.join('/tmp', 'dados-miyukometro.json')
    : path.join(process.cwd(), 'dados-miyukometro.json');

function lerDados() {
    try {
        if (fs.existsSync(ARQUIVO_DADOS)) {
            const conteudo = fs.readFileSync(ARQUIVO_DADOS, 'utf-8');
            return JSON.parse(conteudo);
        }
    } catch (erro) {
        console.error('Erro ao ler dados:', erro);
    }
    
    // Se não existir, tentar ler do arquivo original (deploy)
    try {
        const arquivoOriginal = path.join(process.cwd(), 'dados-miyukometro.json');
        if (fs.existsSync(arquivoOriginal)) {
            const conteudo = fs.readFileSync(arquivoOriginal, 'utf-8');
            const dados = JSON.parse(conteudo);
            // Copiar para /tmp na primeira execução
            if (IS_VERCEL) {
                salvarDados(dados);
            }
            return dados;
        }
    } catch (erro) {
        console.error('Erro ao ler arquivo original:', erro);
    }
    
    return {
        configuracoes: {
            pontuacaoAtual: 0,
            pontosPorAvaliacao: 10,
            senhaExclusao: "bola123",
            nivelPerigo: {
                valor: 0,
                classificacao: "BAIXO"
            }
        },
        avaliacoes: {
            totalComentarios: 0,
            totalDeslikes: 0,
            comentarios: []
        }
    };
}

function salvarDados(dados) {
    try {
        dados.dataUltimaAtualizacao = new Date().toISOString();
        // Garantir que o diretório existe
        const dir = path.dirname(ARQUIVO_DADOS);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dados, null, 2), 'utf-8');
        return true;
    } catch (erro) {
        console.error('Erro ao salvar dados:', erro);
        console.error('Caminho tentado:', ARQUIVO_DADOS);
        return false;
    }
}

function obterClassificacaoPerigo(pontuacao) {
    if (pontuacao < 30) return 'BAIXO';
    if (pontuacao < 60) return 'MÉDIO';
    if (pontuacao < 90) return 'ALTO';
    return 'CRÍTICO';
}

module.exports = async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'DELETE') {
        return res.status(405).json({ erro: 'Método não permitido' });
    }
    
    try {
        // Parse do body se necessário (Vercel pode não fazer isso automaticamente)
        let body = req.body;
        if (typeof body === 'string' || Buffer.isBuffer(body)) {
            try {
                body = JSON.parse(body.toString());
            } catch (e) {
                // Body pode estar vazio para DELETE
            }
        }
        
        const { id } = req.query;
        const { senha } = body || {};
        
        const comentarioId = parseInt(id);

        const dados = lerDados();

        // Validação de senha
        if (senha !== dados.configuracoes.senhaExclusao) {
            return res.status(401).json({ erro: 'Senha incorreta' });
        }

        const comentarioExistia = dados.avaliacoes.comentarios.some(c => c.id === comentarioId);
        
        dados.avaliacoes.comentarios = dados.avaliacoes.comentarios.filter(c => c.id !== comentarioId);
        
        if (comentarioExistia) {
            dados.avaliacoes.totalComentarios = dados.avaliacoes.comentarios.length;
            dados.avaliacoes.totalDeslikes = dados.avaliacoes.comentarios.length;
            dados.configuracoes.pontuacaoAtual = Math.max(0, dados.configuracoes.pontuacaoAtual - dados.configuracoes.pontosPorAvaliacao);
            dados.configuracoes.nivelPerigo.valor = dados.configuracoes.pontuacaoAtual;
            dados.configuracoes.nivelPerigo.classificacao = obterClassificacaoPerigo(dados.configuracoes.pontuacaoAtual);
        }

        const sucesso = salvarDados(dados);
        
        if (!sucesso) {
            return res.status(500).json({ erro: 'Erro ao excluir comentário' });
        }

        return res.status(200).json({ 
            sucesso: true, 
            pontuacao: dados.configuracoes.pontuacaoAtual 
        });
    } catch (erro) {
        console.error('Erro ao excluir comentário:', erro);
        return res.status(500).json({ erro: 'Erro ao excluir comentário' });
    }
};
