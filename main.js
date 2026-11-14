
const http = require('node:http');
const path = require('node:path');
const { mkdir } = require('node:fs/promises');
const { once } = require('node:events');
const { Command } = require('commander');

async function start() {
    const program = new Command();

    program
        .name('web-lab5')
        .description('Кешуючий проксі-сервер для http.cat')
        .helpOption('--help', 'Показати довідку')
        .requiredOption('-h, --host <address>', 'Адреса сервера')
        .requiredOption('-p, --port <number>', 'Порт сервера')
        .requiredOption('-c, --cache <path>', 'Тека кешу');

    program.parse(process.argv);

    const options = program.opts();
    const port = Number(options.port);

    if (!/^\d+$/.test(options.port) || !Number.isInteger(port) || port < 1 || port > 65535) {
        console.error('Помилка: порт має бути цілим числом від 1 до 65535.');
        process.exitCode = 1;
        return;
    }

    try {
        const cacheDir = path.resolve(options.cache);
        await mkdir(cacheDir, { recursive: true });

        const server = http.createServer(async (req, res) => {
            res.writeHead(501, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
            res.end('Обробка HTTP-запитів ще не реалізована.');
        });

        server.listen(port, options.host);
        await once(server, 'listening');

        console.log(`Сервер запущено: http://${options.host}:${port}`);
        console.log(`Тека кешу: ${cacheDir}`);
    } catch (error) {
        console.error(`Помилка запуску сервера: ${error.message}`);
        process.exitCode = 1;
    }
}

start();
