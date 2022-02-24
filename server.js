let express = require("express");
let path = require("path");
let app = express();
const server = app.listen(8000, () => { console.log("listening on port 8000") });
const io = require('socket.io')(server);
let bodyParser = require('body-parser');

const playersClass = require('playersClass');
const enemiesClass = require('enemies');

let players = {};
let playersID = [];
let playersCount = Object.keys(players).length;
let enemies = new enemiesClass();
let mapSize = {};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "./static")));

app.set('views', path.join(__dirname, './views'));
app.set('view engine', 'ejs');

app.get('/', function(req, res) {
    res.render("index");
})

io.on('connection', function (socket) {
    socket.on('player_joining_attempt', handlePlayerJoin);
    socket.on('new_player', handleNewPlayer);
    socket.on('map_size', handleMapSize);
    socket.on('player_action', handlePlayerAction);
    socket.on('move_lesser_enemies', handleMoveLesserEnemies);
    socket.on('collided_to_enemy', handleCollidedWithEnemy);
    socket.on('move_bullets', handleMoveBullets);
    socket.on('enemy_killed', handleEnemyKilled);
    socket.on('player_lost', handleGameEnd);
    socket.on('disconnect', handleDisconnect);

    function handlePlayerJoin() {
        if (playersCount >= 2) {
            socket.emit('lobby_status', {full: true});
        }
        else {
            socket.emit('lobby_status', {full: false});
        }
    }

    function handleNewPlayer(data) {
        playersCount++;
        socket.emit('players_on_lobby', {players: players, player_count: playersCount - 1});

        players[socket.id] = new playersClass(socket.id, data.name, playersCount);
        playersID.push(socket.id);
        io.emit('player_join_lobby', {player: players[socket.id], player_count: playersCount});

        if (playersCount == 2) {
            enemies.lesserEnemies = [{x: 200, y: -30}, {x: 450, y: -40}, {x: 750, y: -50}, {x: 950, y: -20}];
            io.emit('game_starting', {players: players});
        }
    }

    function handleMapSize(data) {
        mapSize = {height: data.gameMapHeight, width: data.gameMapWidth};
    }

    function handlePlayerAction(data) {
        if (data.action == 'left') {
            players[socket.id].position.x -= 10;
        } 
        else if (data.action == 'right') {
            players[socket.id].position.x += 10;
        }
        else if (data.action == 'up') {
            players[socket.id].position.y -= 10;
        }
        else if (data.action == 'down') {
            players[socket.id].position.y += 10;
        }

        if (data.action == 'attack') {
            players[socket.id].bullets.push({
                x: players[socket.id].position.x+5,
                y: players[socket.id].position.y-15
            });
        }

        io.emit('updated_players_stats', {players: players});
    }

    function handleMoveLesserEnemies() {
        enemies.moveEnemies(mapSize.height, mapSize.width);
        io.emit('lesser_enemies', {enemies: enemies.lesserEnemies});
    }

    function handleCollidedWithEnemy(data) {
        players[data.id].playerReceivedDamage();
        io.emit('updated_players_stats', {players: players});
    }

    function handleMoveBullets() {
        players[socket.id].moveBullets();
        io.emit('updated_players_stats', {players: players});
    }

    function handleEnemyKilled(data) {
        players[data.id].enemyKilled(data.bulletIndex);
        enemies.enemyKilled(data.lesserEnemyIndex);

        if (enemies.lesserEnemies.length <= 1) {
            enemies.spawnLesserEnemies(mapSize.width);
        }

        io.emit('updated_players_stats', {players: players});
    }

    function handleGameEnd() {
        let winnerID = playersID.filter(idArray => idArray !== socket.id);
        io.emit('game_end', {winner: winnerID[0], loser: socket.id});
        players = {};
        playersID = [];
        playersCount = 0;
    }

    function handleDisconnect() {
        if (playersCount > 0 && players[socket.id] != null) {
            playersCount--;
            delete players[socket.id];
            socket.broadcast.emit('player_disconnected', {player_id: socket.id, player_count: playersCount});
        }
    }
});