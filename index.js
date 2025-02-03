import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { cachedDataVersionTag } from 'v8';

dotenv.config();

const app = express();
const port = 3000;

const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

db.connect()
    .then(() => console.log("Connected to database"))
    .catch((err) => console.error("Database connection error:", err));




app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use('/uploads', express.static('uploads'));
app.use('/profil', express.static('profil'));


const createDirectories = () => {
    const directories = ['uploads', 'profil'];
    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    });
};
createDirectories();

app.use(session({
    secret:process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
}));


const mealStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'profil/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadMeals = multer({ storage: mealStorage });
const uploadProfile = multer({ storage: profileStorage });

const defaultImage = 'defaultprofil.jpeg';

app.get('/', (req, res) => {
    res.render("index.ejs");
});

app.get('/anasayfa', (req, res) => {
    if (req.session.user) {
        const { id, name } = req.session.user;
        console.log(name);
        res.render("anasayfa.ejs", { id, name, message: req.session.message });
    } else {
        res.redirect('/'); 
    }
});

app.get('/blog', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM mealblog');
        const blogpost = result.rows; 
        console.log('Blog posts:', blogpost);
        res.render('blog.ejs', { blogpost });
    } catch (err) {
        console.error('Database error:', err);
        res.render('blog.ejs', { blogpost: [], message: 'ERROR' });
    }
});


app.get('/profil', async (req, res) => {  

    const user = req.session.user;

    if (!user) {
        return res.redirect('/');
    }

    try {
        const userPost = await db.query('SELECT * FROM mealblog WHERE user_id = $1',[user.id])
        const userPosts = userPost.rows;
        console.log('User posts:', userPosts);
        const profil = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);

        if (profil.rows.length === 0) {
            
            req.session.destroy();
            return res.redirect('/');
        }

        const profilimg = profil.rows[0].profilimg;
        const profilusername = profil.rows[0].username;
        const surname = profil.rows[0].surname;
        const age = profil.rows[0].age;
        const tel = profil.rows[0].tel;
        
        res.render('profil.ejs', { user, profilimg, profilusername, age,tel,surname, userPosts });
        console.log(profilimg);
    } catch (err) {
        console.error('Database error:', err);
        res.redirect('/');
    }
});


app.post('/updateprofil', uploadProfile.single('profilimg'), async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login'); 
        }

       
        const profil = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
        const existingData = profil.rows[0];

        if (!existingData) {
            return res.render('profil.ejs', { message: 'Kullanıcı bulunamadı.' });
        }

        const { username, password, name, surname, age, tel } = req.body;

        const updatedUsername = username || existingData.username;
        const updatedPassword = password || existingData.password;
        const updatedName = name || existingData.name;
        const updatedSurname = surname || existingData.surname;
        const updatedAge = age || existingData.age;
        const updatedTel = tel || existingData.tel;

        
        const currentImagePath = existingData.profilimg;
        const imagePath = req.file ? req.file.filename : currentImagePath || 'defaultprofil.jpeg';

      
        const result = await db.query(
            'UPDATE users SET username = $1, password = $2, name = $3, surname = $4, age = $5, tel = $6, profilimg = $7 WHERE id = $8 RETURNING id, name, profilimg',
            [updatedUsername, updatedPassword, updatedName, updatedSurname, updatedAge, updatedTel, imagePath, user.id]
        );

        if (result.rows.length > 0) {
            
            req.session.user = {
                id: result.rows[0].id,
                name: result.rows[0].name,
                profilimg: result.rows[0].profilimg,
            };
            req.session.message = 'Profil güncellendi';
            return res.redirect('/profil');
        } else {
            return res.render('profil.ejs', { message: 'Profil güncellenemedi.' });
        }
    } catch (err) {
        console.error('Database error:', err);
        res.render('profil.ejs', { message: 'Beklenmeyen bir hata oluştu.' });
    }
});

app.post('/post' , async (req,res)=>{
 const user = req.session.user;
    if(!user){
        return res.redirect('/');
    }   

    const { id } = req.body;

    try{
        const result = await db.query('SELECT * FROM mealblog WHERE id = $1',[id]);
        const results = result.rows;
        console.log('Post:', results);
        res.render('post.ejs', { results });
    }
    catch(err){
        console.error(err);
        res.redirect('/profil');

    }
});






app.post('/editpost', uploadMeals.single('mealimg'), async (req, res) => {
    
    try {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }

    const { id } = req.body;
    
    const result = await db.query('SELECT * FROM mealblog WHERE id = $1', [id]);
    const existingData = result.rows[0];

    if (!existingData) {
        return res.redirect('/profil');
    }

    const { mealname, mealtype, mealing, mealinst, secret, mealwritter } = req.body;
    const updatedMealname = mealname || existingData.mealname;
    const updatedMealtype = mealtype || existingData.mealtype;
    const updatedMealing = mealing || existingData.mealing;
    const updatedMealinst = mealinst || existingData.mealinst;
    const updatedSecret = secret || existingData.secret;
    const updatedMealwritter = mealwritter || existingData.mealwritter;

    
    const existingImagePath = existingData.mealimg;
    const imagePath = req.file ? req.file.filename : existingImagePath;

        const updatedet = await db.query(
            'UPDATE mealblog SET mealname = $1, mealtype = $2, mealing = $3, mealinst = $4, secret = $5, mealwritter = $6, mealimg = $7 WHERE id = $8 RETURNING id',
            [updatedMealname, updatedMealtype, updatedMealing, updatedMealinst, updatedSecret, updatedMealwritter, imagePath, id]
        );

        if (updatedet.rows.length > 0) {
            res.redirect('/profil');
            console.log('Post updated successfully');
        } else {
            res.redirect('/profil');
            console.log('Post could not be updated');
        }
    } catch (err) {
        console.error(err);
        res.redirect('/profil');
    }
});


app.post('/deletepost', async (req, res) => {

    const user = req.session.user;
    if(!user){
         return res.redirect('/');
    }
        const { id } = req.body;
        try {
            const result = await db.query('DELETE FROM mealblog WHERE id = $1', [id]);
            if (result.rowCount > 0) {
                res.redirect('/profil');
                console.log('Post deleted successfully');
            } else {
                res.redirect('/profil?error=Silinemedi');
            }
        } catch (err) {
            console.error(err);
            res.redirect('/profil?error=Hata');
        }
    });



app.post('/login', async (req, res) => {
    const { username, password } = req.body;   
    try{
        const result = await db.query('SELECT * FROM users WHERE username =$1 AND password =$2',[username,password]);
        if(result.rows.length > 0){
            const user = result.rows[0];
            req.session.user = { id: user.id, name: user.name, usersurname: user.surname, userage: user.age, usertel: user.tel }; 
            req.session.message = 'Login successful'; 
            res.redirect('/anasayfa'); 
            console.log('Login successful');
        }
        else{
            res.render("index.ejs", { message: 'Login failed' });
            console.log('Login failed');
        }
    }
    catch(err){
        console.error('Database error:', err);
        console.log('An unexpected error occurred');
        res.render("index.ejs", { message: 'An unexpected error occurred' });
    }  

});

app.post('/registerpage', (req, res) => {
    res.render("register.ejs");
});

app.post('/register', uploadProfile.single('profilimg'), async (req, res) => {
    const { username, password, name, surname, age, tel } = req.body;
    const imagePath = req.file ? req.file.filename : defaultImage;

    try {
        const checkResult = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        if (checkResult.rows.length > 0) {
            res.render("register.ejs", { message: 'Username already exists, try another one or login with the existing one.' });
        } else {
            const result = await db.query(
                'INSERT INTO users (username, password, name, surname, age, tel, profilimg) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [username, password, name, surname, age, tel, imagePath]
            );

            if (result.rows.length > 0) {
                req.session.user = { id: result.rows[0].id, name };
                req.session.message = 'User registered successfully';
                res.redirect('/anasayfa');
            } else {
                res.render("register.ejs", { message: 'User registration failed' });
            }
        }
    } catch (err) {
        console.error('Database error:', err);
        res.render("register.ejs", { message: 'An unexpected error occurred' });
    }
});



app.post('/newpost', uploadMeals.single('mealimg'), async (req, res) => {
    const { mealname, mealtype, mealing, mealins, secret, mealwritter } = req.body;
    const userId = req.session.user ? req.session.user.id : null; 
    const imagePath = req.file ? req.file.filename : null; 

    if (!userId) {
        res.render("newpost.ejs", { message: 'Oturum açmalısınız.' });
        return;
    }

    try {
        const query = `
            INSERT INTO mealblog (mealname, mealtype, mealing, mealinst, secret, mealwritter, mealimg, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        const values = [mealname, mealtype, mealing, mealins, secret, mealwritter, imagePath, userId];

        await db.query(query, values);
        console.log('Post added successfully');
        res.redirect('/blog');
    } catch (err) {
        console.error('Database error:', err);
        res.render("newpost.ejs", { message: 'Beklenmeyen bir hata oluştu.' });
        console.log('An unexpected error occurred');
    }
});


app.get('/newpost',(req,res)=>{
    res.render("newpost.ejs");
});


app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/'); 
    });
})
app.post('/logout', (req, res) => {

    
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.redirect('/'); 
    });
});


app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
