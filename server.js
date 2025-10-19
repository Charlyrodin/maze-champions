// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir los archivos estáticos de la carpeta 'public'
app.use(express.static('public'));

// --- Lógica del Juego ---
let waitingPlayer = null; // Almacenará al jugador que está esperando oponente
let gameRooms = {}; // Almacenará las partidas activas por nombre de sala

// Función para generar la estructura de datos del laberinto en el servidor.
// Por ahora, crea un laberinto aleatorio simple.
// Para un proyecto más avanzado, podrías adaptar tu 'maze_generator_code.js' para que se ejecute aquí en Node.js.
function generateServerMaze(width, height) {
    const cells = Array(width).fill(null).map(() => Array(height).fill(null));
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            // [arriba, abajo, izq, der]
            cells[x][y] = {
                wall: [Math.random() > 0.5, Math.random() > 0.5, Math.random() > 0.5, Math.random() > 0.5],
                visited: false
            };
        }
    }
    // Asegurar que siempre haya un camino (simplificación)
    for (let i = 0; i < width; i++) {
        cells[i][Math.floor(height/2)].wall[2] = false;
        cells[i][Math.floor(height/2)].wall[3] = false;
    }

    // Asegurar entrada y salida
    cells[0][0].wall[0] = false; // Entrada arriba
    cells[width - 1][height - 1].wall[1] = false; // Salida abajo

    return {
        rows: height,
        columns: width,
        cells: cells,
        start: { x: 0, y: 0 },
        end: { x: width - 1, y: height - 1 }
    };
}

io.on('connection', (socket) => {
    console.log(`Jugador conectado: ${socket.id}`);

    // Cuando un jugador quiere unirse a una partida
    socket.on('joinGame', (playerInfo) => {
        playerInfo.id = socket.id; // Asignar el ID del socket al jugador

        if (waitingPlayer) {
            // Si ya hay un jugador esperando, empezamos la partida
            const roomName = `room_${socket.id}_${waitingPlayer.id}`;
            const player1 = waitingPlayer;
            const player2 = playerInfo;

            // Unir a ambos jugadores a la sala
            const player1Socket = io.sockets.sockets.get(player1.id);
            if (player1Socket) {
                player1Socket.join(roomName);
            }
            socket.join(roomName);

            // Crear el estado del juego
            gameRooms[roomName] = {
                players: [player1, player2]
            };

            console.log(`Partida creada en la sala ${roomName} entre ${player1.name} y ${player2.name}`);

            const mazeData = generateServerMaze(20, 20);

            // Enviar el mismo laberinto a AMBOS jugadores en la sala
            io.to(roomName).emit('gameStart', { maze: mazeData, players: [player1, player2], room: roomName });

            // Ya no hay nadie esperando
            waitingPlayer = null;

        } else {
            // Si no hay nadie, este jugador se convierte en el que espera
            waitingPlayer = playerInfo;
            console.log(`Jugador ${playerInfo.name} (${socket.id}) está esperando oponente.`);
        }
    });

    // Escuchar los movimientos de los jugadores
    socket.on('playerMove', (data) => {
        // Re-transmitir el movimiento del jugador a los otros jugadores en la sala
        socket.to(data.room).emit('opponentMove', { playerId: socket.id, position: data.position });
    });

    // Escuchar cuando un jugador declara la victoria
    socket.on('playerWin', (data) => {
        console.log(`Jugador ${data.winnerId} ha ganado en la sala ${data.room}`);
        // Notificar a TODOS en la sala (incluido el ganador) que el juego ha terminado
        io.to(data.room).emit('gameOver', { winnerId: data.winnerId });

        // Limpiar la sala de juego para futuras partidas
        delete gameRooms[data.room];
    });

    socket.on('disconnect', () => {
        console.log(`Jugador desconectado: ${socket.id}`);
        // Si el jugador que se desconecta estaba esperando, limpiamos la espera
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        // Aquí iría la lógica para limpiar las salas de juego si un jugador abandona a mitad de partida
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));