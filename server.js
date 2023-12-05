const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Actions');
const compiler = require('compilex');
const cors = require('cors');


const server = http.createServer(app);
const io = new Server(server);

app.get('/', async (req, res) => {
    res.status(200).send({
        message: "Hello World",
    });
});

app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(cors());
var option = { stats: true };
compiler.init(option);



app.post("/compilecode", function (req, res) {
    var code = req.body.code;
    console.log(code);
    var lang = "C++";

    if (lang === "C" || lang === "C++") {
        var envData = { OS: "windows", cmd: "g++", options: { timeout: 1000 } };
            compiler.compileCPP(envData, code, function (data) {
                res.send(data);
            });
    }
    else if(lang === "Python") {
        var envData = { OS: "windows" };
        compiler.compilePython(envData, code, function (data) {
            res.send(data);
        });
    }
});

app.get("/fullStat", function (req, res) { // Fixed incorrect parameter
    compiler.fullStat(function (data) {
        res.send(data);
    });
});

app.use(express.static('build'));
app.use((req, res, next) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const userSocketMap = {}; // this is a map which stores all the socketId with respect to its user name mp[socketId]=username;
function getAllConnectedClients(roomId) {
    //  this returns a Map using Array witll change it into array it returns all the socket id of the sockets present in that room
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],// we are sending the username from the map because we need to inform all the connected users about the new user so we can change in the ui
            };
        }
    );
}
// on is for listneing the event its an event listner
io.on('connection', (socket) => {// its a call back function gives the socket id of the clients connected
    // console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;// add in the map
        socket.join(roomId); // if room already present then joins it otherwise creates a new room
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {// so for each client we will use there clientID to send them an event that a new client is joined and that they shoudl update there ui
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,// all the clients
                username,// new client user name
                socketId: socket.id,// new client socket id 
            });
        });
    });

    //listneing for the code change event we get from the editor where we get the roomide and code as a 
    // call back argurmetns 
    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        // emmiting to all the clients connected to that room id the code 
        // we are doing brodcast we are emitting to all other clients except self if we use io then it will also give us as we dont need it we use this brodcast method 
        // socket is the current socket where the change is io is the seerver socket
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });
    // we get the socket id we need to send the code to 
    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });
    // 'dissconectiong' just before getting disconneccted (browser closes)if any client disconnects it send the event to the server so we are
    // listneing for it 
    socket.on('disconnecting', () => {
        // getting all the rooms from the socket call back variable it was associated with its in the form of maps we convert it into array one user might be connected
        // to multiple rooms so we do this so that we can get all the rooms it was connected with 
        const rooms = [...socket.rooms];
        // to all the connected rooms we will emit an Disconnected event and send socket id and username of current socket as callback so that they
        // can remove it from them before socket officially calling the leave()
        rooms.forEach((roomId) => {
            // sending to every room id 
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        // deleting the user from the map 
        delete userSocketMap[socket.id];
        // officially ending the scoket
        socket.leave();
    });
});

const PORT = 10000;
server.listen(PORT, () => console.log(`Listening on port http://localhost:10000/`));
