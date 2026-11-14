
const http = require('node:http');
const path = require('node:path');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { once } = require('node:events');
const { Command } = require('commander');
const superagent = require('superagent');

function getCacheFilePath(requestUrl, cacheDir) {
    const pathname = requestUrl.split('?')[0];
    const match = /^\/(\d{3})$/.exec(pathname);

    if (!match) {
        return null;
    }

    const code = match[1];
    return path.join(cacheDir, `${code}.jpg`);
}

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
            const cacheFilePath = getCacheFilePath(req.url, cacheDir);

            if (cacheFilePath === null) {
                res.writeHead(400, {
                    'Content-Type': 'text/plain; charset=utf-8'
                });
                res.end('Помилка: шлях має містити три цифри, наприклад /418.');
                return;
            }

            if (req.method !== 'GET') {
                res.writeHead(501, {
                    'Content-Type': 'text/plain; charset=utf-8'
                });
                res.end('Цей HTTP-метод ще не реалізовано.');
                return;
            }

            const code = path.basename(cacheFilePath, '.jpg');

            try {
                let image;
                let source;

                try {
                    image = await readFile(cacheFilePath);
                    source = 'cache';
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        throw error;
                    }

                    try {
                        const response = await superagent
                            .get(`https://http.cat/${code}`)
                            .buffer(true);

                        if (!Buffer.isBuffer(response.body) ||
                            !response.type.startsWith('image/jpeg')) {
                            res.writeHead(404, {
                                'Content-Type': 'text/plain; charset=utf-8'
                            });
                            res.end('Картинку не знайдено на http.cat.');
                            return;
                        }

                        image = response.body;
                    } catch (error) {
                        res.writeHead(404, {
                            'Content-Type': 'text/plain; charset=utf-8'
                        });
                        res.end('Не вдалося отримати картинку з http.cat.');
                        return;
                    }

                    await writeFile(cacheFilePath, image);
                    source = 'http.cat';
                }

                res.writeHead(200, {
                    'Content-Type': 'image/jpeg',
                    'X-Image-Source': source
                });
                res.end(image);

            } catch (error) {
                console.error(`Помилка обробки GET: ${error.message}`);
                res.writeHead(500, {
                    'Content-Type': 'text/plain; charset=utf-8'
                });
                res.end('Помилка сервера під час роботи з кешем.');
            }
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
