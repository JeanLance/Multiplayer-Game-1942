$(document).ready(function() {
    let playerName = prompt('Enter your name to join:');

    if (playerName == null || playerName == "") {
        $('#game-lobby').html('<h3>Sorry, but you cannot join the game without specifying your name first.</h3>');
    }
    else {
        const socket = io();

        socket.emit('player_joining_attempt');
        
        let gameJoin = () => {
            return new Promise((resolve, reject) => {
                socket.on('lobby_status', (data) => {
                    if (data.full == true) {
                        reject();
                    }
                    else {
                        resolve();
                    }
                });
            });
        }
        
        gameJoin()
            .then(() => {
                const battleField = document.getElementById('game-map');
                let gameLoops;
                let players = {};
                let lesserEnemies = [];
                let bullets = [];
                let explosionLocation = [];

                socket.emit('new_player', {name: playerName});

                /* Display all existing players in the lobby if there are some */
                socket.on('players_on_lobby', (data) => {
                    for (const key in data.players) {
                        addPlayers(data.players[key], data.player_count);
                    }
                });
        
                /* Display the data of the player who joined the lobby */
                socket.on('player_join_lobby', (data) => {
                    addPlayers(data.player, data.player_count);
                });

                /* Countdown in starting the game */
                socket.on('game_starting', (data) => {
                    $('#game-lobby').append('<h4>Game Starts in: <span class="game-countdown">5</span></h4>');
                    let countdown = 5;
                    let gameStartTimer = setInterval(() => {
                        $('.game-countdown').text(countdown);
                        if (countdown == 0) {
                            clearInterval(gameStartTimer);
                            gameStart(data);
                        }
                        else {
                            countdown--;
                        }
                    }, 1000);
                });
                
                /* Spawning lesser enemies */
                socket.on('lesser_enemies', (data) => {
                    lesserEnemies = data.enemies;
                });

                /* All updates regarding the players stats are updated (from server to client) */
                socket.on('updated_players_stats', (data) => {
                    for (const key in data.players) {
                        $('tr.'+key+' td span.life').text(data.players[key].player_life);
                        $('div.'+key+' span.player-score').text(data.players[key].player_score);
                        players[key] = data.players[key];
                        players[key]['element'] = document.querySelector('.player'+data.players[key].player_number);
                    
                        if (players[socket.id].player_life <= 0) {
                            socket.emit('player_lost');
                        }
                    }
                });

                /* Display proper page and message when a winner is shown */
                socket.on('game_end', (data) => {
                    const winner = players[data.winner];
                    const loser = players[data.loser];

                    clearInterval(gameLoops);

                    let endPageHTML = '<div id="game-lobby">';
                    endPageHTML += '<h3>'+loser.player_name+' has no life left.</h3>';
                    endPageHTML += '<h3>'+loser.player_name+' lost the game with a score of '+loser.player_score+'.\n '+winner.player_name+' won the game with a score of '+winner.player_score+'.</h3>';
                    endPageHTML += '<p>Refresh the page to start a new game.</p></div>';
                    document.body.innerHTML = endPageHTML;
                });

                /* Remove disconnected players DOM in the page */
                socket.on('player_disconnected', (data) => {
                    $('#'+data.player_id).remove();
                    $('#player-count').text(data.player_count);
                    $('.number').text(data.player_count);
                });

                /* Add players in the lobby */
                function addPlayers(data, player_count) {
                    let playerHTML = '<div class="player" id="'+data.player_id+'"><div class="player'+player_count+'-hero"></div>';
                    playerHTML += '<span class="player-name">'+data.player_name+'</span>';
                    playerHTML += '<span class="player-number">(Player <span class="number">'+player_count+')</span></span></div>';
                    $('#players-list').append(playerHTML);
                    $('#player-count').text(player_count);
                }
        
                /* Function to intiate the game (starting all game event loops) */
                function gameStart(data) {
                    $('#game-lobby').remove();

                    for (const key in data.players) {
                        // Player plane character DOM
                        $('#game-map').prepend('<div id="'+data.players[key].player_id+'" class="player'+data.players[key].player_number+'"></div>');
                        // Assigning players object variable with their DOM
                        players[key] = data.players[key];
                        players[key]['element'] = document.querySelector('.player'+data.players[key].player_number);
                        
                        // Appending players name in players tab list
						let playersTabHTML = '<tr class="'+data.players[key].player_id+'">\n<td class="player-name">'+data.players[key].player_name+'</td>';
                        playersTabHTML += '<td><span class="player'+data.players[key].player_number+'-hero"></span><span class="life">'+data.players[key].player_life+'</span>\n</td></tr>';
                        $('#players-list-tab').append(playersTabHTML);
                        
                        // Appending players score in players score tab
                        let playersScoreHTML = '<div class="'+data.players[key].player_id+'">'+data.players[key].player_name+': <span class="player-score">'+data.players[key].player_score+'</span></div>';
                        $('#players-score-tab').append(playersScoreHTML);
                    }
                    socket.emit('map_size', {gameMapHeight: battleField.offsetHeight, gameMapWidth: battleField.offsetWidth});

                    gameLoops = setInterval(gameEvents, 40);    // Starting event loop of the game
                }
                
                /* Display all players character according to their coordinates */
                function displayHero() {
                    for (const key in players) {
                        players[key].element.style['top'] = players[key].position.y + "px";
                        players[key].element.style['left'] = players[key].position.x + "px";
                    }
                }

                /* Display players bullets */
                function displayPlayerBullets() {
                    let output = "";
                    for (const key in players) {
                        for (let i = 0; i < players[key].bullets.length; i++) {
                            if (players[key].bullets[i]) {
                                output += '<div class="bullet'+players[key].player_number+'" style="top:'+players[key].bullets[i].y+'px; left:'+players[key].bullets[i].x+'px;"></div>';
                            }
                        }
                    }
                    document.getElementById('bullets').innerHTML = output;
                }

                /* Detecting collision (lesser enemies are the enemy for now and some new enemies maybe added in the future) */
                function detectCollisions() {
                    for (const key in players) {
                        collisionToEnemy(players[key], key);
                        bulletCollisionToEnemy(players[key], key);
                    }
                }

                /* Detecting bullet interaction with the enemies */
                function bulletCollisionToEnemy(player, key) {
                    for (let i = 0; i < lesserEnemies.length; i++) {
                        for (let j = 0; j < player.bullets.length; j++) {
                            if (player.bullets[j] && lesserEnemies[i] && Math.abs(player.bullets[j].x - lesserEnemies[i].x) <= 15 && Math.abs(player.bullets[j].y - lesserEnemies[i].y) <= 15) {
                                socket.emit('enemy_killed', {
                                    id: key,
                                    bulletIndex: j,
                                    lesserEnemyIndex: i
                                });

                                explosionLocation.push({x: lesserEnemies[i].x, y: lesserEnemies[i].y});
                                displayExplosion();
                            }
                        }
                    }
                }

                /* Detecting collision of enemy to player */
                function collisionToEnemy(player, key) {
                    for (let i = 0; i < lesserEnemies.length; i++) {
                        if (lesserEnemies[i] && players[key].player_immune == false && Math.abs(players[key].position.x - lesserEnemies[i].x) <= 15 && Math.abs(players[key].position.y - lesserEnemies[i].y) <= 15) {
                            socket.emit('collided_to_enemy', {id: key});
                            heroImmune(key);
                        }
                    }
                }
        
                /* Make the player immune to damage after taking a damage */
                function heroImmune(id) {
                    let immuneSeconds = 0;
                    let immuneStart = setInterval(() => {
                        (immuneSeconds % 2 == 1) ? players[id].element.style.opacity = 0 : players[id].element.style.opacity = 1;

                        if (immuneSeconds >= 10) {  // 3 whole seconds
                            clearInterval(immuneStart);
                        }
                        immuneSeconds++;
                    }, 300);
                }
                
                /* Displays all explosion (killing enemy creates explosion) */
                function displayExplosion() {
                    let output = "";
                    for (let i = 0; i < explosionLocation.length; i++) {
                        output += "<div class='explosion' style='top:"+explosionLocation[i].y+"px; left:"+explosionLocation[i].x+"px;'></div>";
                
                        setTimeout(function() {
                            explosionLocation.shift(); 
                            displayExplosion()
                        }, 2000);
                    }
                    document.getElementById('explosions').innerHTML = output;
                }
                
                /* Display all enemies according to their every coordinates */
                function displayEnemies() {
                    let output = "";
                    for (let i = 0; i < lesserEnemies.length; i++) {
                        output += "<div class='enemy1' style='top:"+lesserEnemies[i].y+"px; left:"+lesserEnemies[i].x+"px;'></div>";
                    }
                    document.getElementById('enemies').innerHTML = output;
                }
                
                /* Move entites aside from player (enemies, bullets) */
                function moveEntities() {
                    socket.emit('move_lesser_enemies');
                    socket.emit('move_bullets');
                }
                
                /* Running all necessary event loops of the game */
                function gameEvents() {
                    displayHero();
                    moveEntities();
                    displayPlayerBullets();
                    displayEnemies();
                    detectCollisions();
                }
                
                /* Player action using the specified keys */
                document.onkeydown = (event) => {
                    let player = players[socket.id];
                    if (player) {
                        if (event.code == 'ArrowLeft' && player.position.x > battleField.offsetLeft) { // Left
                            socket.emit('player_action', {action: 'left'});
                        }
                        else if (event.code == 'ArrowRight' && player.position.x < (battleField.offsetWidth - 30)) { // Right
                            socket.emit('player_action', {action: 'right'});
                        }
                        else if (event.code == 'ArrowUp' && player.position.y > battleField.offsetTop) { // Up
                            socket.emit('player_action', {action: 'up'});
                        }
                        else if (event.code == 'ArrowDown' && player.position.y < (battleField.offsetHeight - 40)) { // Down
                            socket.emit('player_action', {action: 'down'});
                        }
                        if (event.code == 'Space') { // Space, to shoot bullets
                            bullets.push({x:player.position.x+5, y:player.position.y-15});
                            socket.emit('player_action', {action: 'attack'});
                        }
                    }
                }
            })
            .catch(() => {
                /* Catch an error if a player joined the lobby when it's already full */
                $('#game-lobby').html('<h3>Sorry, but you cannot join the game because the lobby is already full.</h3>');
            })
    }
});