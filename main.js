
const http = require('node:http');
const path = require('node:path');
const { mkdir, readFile, writeFile, unlink } = require('node:fs/promises');
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
            if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
                res.writeHead(405, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Allow': 'GET, PUT, DELETE'
                });
                res.end('Помилка: цей HTTP-метод не дозволено.');
                return;
            }

            const cacheFilePath = getCacheFilePath(req.url, cacheDir);

            if (cacheFilePath === null) {
                res.writeHead(400, {
                    'Content-Type': 'text/plain; charset=utf-8'
                });
                res.end('Помилка: шлях має містити три цифри, наприклад /418.');
                return;
            }

            if (req.method === 'PUT') {
                try {
                    const chunks = [];

                    for await (const chunk of req) {
                        chunks.push(chunk);
                    }

                    const image = Buffer.concat(chunks);

                    if (image.length === 0) {
                        res.writeHead(400, {
                            'Content-Type': 'text/plain; charset=utf-8'
                        });
                        res.end('Помилка: тіло запиту порожнє.');
                        return;
                    }

                    await writeFile(cacheFilePath, image);

                    res.writeHead(201, {
                        'Content-Type': 'text/plain; charset=utf-8'
                    });
                    res.end('Картинку збережено в кеш.');
                } catch (error) {
                    console.error(`Помилка обробки PUT: ${error.message}`);
                    res.writeHead(500, {
                        'Content-Type': 'text/plain; charset=utf-8'
                    });
                    res.end('Помилка сервера під час збереження картинки.');
                }
                return;
            }

            if (req.method === 'DELETE') {
                try {
                    await unlink(cacheFilePath);

                    res.writeHead(200, {
                        'Content-Type': 'text/plain; charset=utf-8'
                    });
                    res.end('Картинку видалено з кешу.');
                } catch (error) {
                    if (error.code === 'ENOENT') {
                        res.writeHead(404, {
                            'Content-Type': 'text/plain; charset=utf-8'
                        });
                        res.end('Картинку не знайдено в кеші.');
                    } else {
                        console.error(`Помилка обробки DELETE: ${error.message}`);
                        res.writeHead(500, {
                            'Content-Type': 'text/plain; charset=utf-8'
                        });
                        res.end('Помилка сервера під час видалення картинки.');
                    }
                }
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
