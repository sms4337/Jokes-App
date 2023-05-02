const axios = require("axios");
const { Configuration, OpenAIApi } = require("openai");
const highcharts = require("highcharts");
const env = require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();

const port = 3000;
const uri =
  "mongodb+srv://vinesh:password123!@cluster0.spld1sx.mongodb.net/?retryWrites=true&w=majority";
// Create a MongoClient with a MongoClientOptions object to set the Stable API version

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10, // Set the maximum size of the connection pool
});

app.set("views", "./views");
app.set("view engine", "ejs");

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const configuration = new Configuration({
  organization: "org-ZnBMwh2DwUG0VhuFwwNKv29z",
  apiKey: OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const categoryData = (category) =>
  JSON.stringify({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: ` Give me  105 ${category} jokes in similar pattern , 1: Why couldn't the bicycle stand up by itself? Because it was two-tired. 2: Why don't scientists trust atoms? Because they make up everything.`,
      },
    ],
    temperature: 1,
    top_p: 1,
    presence_penalty: 0.6,
  });

const config = {
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  },
};

const ratings = [1, 2, 3, 4, 5];
const jokeCategories = [
  "sarcasm",
  "observational",
  "dad",
  "animal",
  "technology",
  "office",
];
//const jokeCategories = ["office"];
const jokesList = {
  office: [],
};

const generateJokes = async () => {
  console.log("generating Jokes");
  for (const category of jokeCategories) {
    jokesList[category] = [];
    const data = categoryData(category);
    try {
      await generateJokesByCategory(category, data);
    } catch (error) {
      console.error(`Error generating joke for category "${category}"`);
      console.error(error);
    }
  }
  const db = client.db("proj");

  const data = { joke: "example joke", rating: { vinesh: 5, rakesh: 4 } };
  jokeCategories.forEach((category) => {
    const collection = db.collection(category);
    const jokesDB = [];
    jokesList[category].forEach((jokeMsg, i) => {
      if (i < 105) {
        jokesDB.push({ joke: jokeMsg, rating: {} });
      }
    });
    console.log(jokesDB);
    collection.insertMany(jokesDB);
  });
};

async function generateJokesByCategory(category, data) {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    data,
    config
  );
  const jokesText = response.data.choices[0].message.content;
  const jokes = jokesText
    .split("\n")
    .map((joke) => joke.replace(/^\d+\.\s*/, ""));
  console.log(jokesText)
  if (!jokesList[category]) {
  }
  jokes.forEach((joke) => {
    if(joke.length < 10){
    }
    else if (
      jokesList[category].includes(joke) &&
      jokesList[category].length >= 105
    ) {
    } else {
      jokesList[category].push(joke);
    }
  });
  if (jokesList[category].length < 105) {
    console.log("less", jokesList[category].length);
    await generateJokesByCategory(category, data);
  }
}

async function categoryExists(category) {
  const db = client.db("proj");
  const collection = db.collection(category);

  try {
    const items = await collection.find().limit(1).toArray();

    if (items.length > 0) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.log("Error: " + err);
    throw new Error("An error occurred while retrieving the data.");
  }
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    await client.connect();
    categoryExists(jokeCategories[jokeCategories.length - 1])
      .then((exists) => {
        if (!exists) {
          return generateJokes();
        }
      })
      .catch((err) => {
        console.error(err);
      });
  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.put("/rating", (req, res) => {
  const { id, category, user, rating } = req.body;

  const db = client.db("proj");
  const collection = db.collection(category);

  const filter = { _id: new ObjectId(id) };
  const update = { $set: { [`rating.${user}`]: rating } };
  const options = { returnOriginal: false };
  collection
    .findOneAndUpdate(filter, update, options)
    .then((obj) => {
      console.log(obj);
      res.send(obj);
    })
    .catch((err) => {
      console.log("Error: " + err);
    });
});

app.get("/rating", (req, res) => {
  const { id, category, user } = req.query;

  const db = client.db("proj");
  const collection = db.collection(category);

  const filter = { _id: new ObjectId(id) };
  const projection = { rating: 1 };
  collection
    .findOne(filter, projection)
    .then((item) => {
      const ratings = Object.values(item.rating).map(Number);
      const sum = ratings.reduce((acc, curr) => acc + curr, 0);
      const avgRating = sum / ratings.length;
      const userCount = ratings.length;
      const userRating =
        item.rating && item.rating[user] ? item.rating[user] : 0;
      res.send({ avgRating, userRating, userCount });
    })
    .catch((err) => {
      console.log("Error: " + err);
    });
});

app.get("/nextjoke", (req, res) => {
  const { user, category } = req.query;

  const db = client.db("proj");
  const collection = db.collection(category);

  const ratingFind = "rating." + user;
  const filter = { [ratingFind]: { $exists: false } }; // use computed property name
  const projection = { joke: 1, rating: 1 };
  collection
    .aggregate([
      { $match: filter },
      { $sample: { size: 1 } },
      { $project: projection },
    ])
    .toArray()
    .then((items) => {
      if (items.length === 0) {
        res.status(404).send("No unrated jokes found");
        return;
      }
      console.log('Fetching joke for category', category, 'and user', user)
      const item = items[0];
      console.log('Joke fetched from db', item)
      res.send({ id: item._id, joke: item.joke, rating: item.rating });
    })
    .catch((err) => {
      console.log("Error: " + err);
    });
});

app.get("/all", (req, res) => {
  const db = client.db("proj");
  const categories = [
    "sarcasm",
    "observational",
    "dad",
    "animal",
    "technology",
    "office",
  ];
  const promises = categories.map((category) => {
    const collection = db.collection(category);
    const projection = { _id: 0, joke: 1, rating: 1 };
    return collection
      .find({}, projection)
      .toArray()
      .then((items) => ({ category, jokes: items }));
  });
  Promise.all(promises)
    .then((results) => res.send({ categories: results }))
    .catch((err) => {
      console.log("Error: " + err);
      res.status(500).send("An error occurred while retrieving the data.");
    });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

app.get("/bar", async (req, res) => {
  // Define the categories and ratings
  const categories = jokeCategories;
  const ratings = [1, 2, 3, 4, 5];

  // Create an empty data array
  const data = {
    categories: [],
    series: [],
    title: "Rating of Different categories of Jokes for all users"
  };

  const db = client.db("proj");
  const promises = categories.map((category) => {
    const collection = db.collection(category);
    const projection = { _id: 0, joke: 1, rating: 1 };
    return collection
      .find({}, projection)
      .toArray()
      .then((items) => ({ category, jokes: items }));
  });
  Promise.all(promises)
    .then((results) => {
      data.categories = categories;
      data.series = [];

      ratings.forEach((rating) => {
        data.series.push({
          name: rating + " Star",
          data: [0, 0, 0, 0, 0, 0],
        });
      });

      results.forEach((category, i) => {
        category.jokes.forEach((joke) => {
          for (const key of Object.keys(joke.rating)) {
            const rating = joke.rating[key];
            if (rating > 0) {
              data.series[rating - 1].data[i] =
                data.series[rating - 1].data[i] + 1;
            }
          }
        });
        console.log(data.series[i]);
      });
      console.log(data);

      res.render("bar", { data });
    })
    .catch((err) => {
      console.log("Error: " + err);
      res.status(500).send("An error occurred while retrieving the data.");
    });

  // Render the EJS file with the Highcharts chart
});

app.get("/avg", async (req, res) => {
  // Define the categories and ratings
  const categories = jokeCategories;
  const ratings = [1, 2, 3, 4, 5];

  // Create an empty data array
  const data = {
    categories: [],
    series: [],
    title: "Average rating of jokes by category for all users "
  };

  const db = client.db("proj");
  const promises = categories.map((category) => {
    const collection = db.collection(category);
    const projection = { _id: 0, joke: 1, rating: 1 };
    return collection
      .find({}, projection)
      .toArray()
      .then((items) => ({ category, jokes: items }));
  });
  Promise.all(promises)
    .then((results) => {
      data.categories = jokeCategories;
      data.series = [];

      categories.forEach((category, i) => {
        data.series.push({
          name: category,
          data: [[i, 0]],
        });
      });

      results.forEach((category, i) => {
        let totalrating = 0;
        let count = 0;
        category.jokes.forEach((joke) => {
          for (const key of Object.keys(joke.rating)) {
            const rating = joke.rating[key];
            if (rating > 0) {
              totalrating+= rating;
              count++;
            }
          }
        });
        data.series[i].data[0][1] += totalrating/count;
        console.log(data.series[i]);
      });
      console.log(data);

      res.render("column", { data });
    })
    .catch((err) => {
      console.log("Error: " + err);
      res.status(500).send("An error occurred while retrieving the data.");
    });

  // Render the EJS file with the Highcharts chart
});


app.get("/median", async (req, res) => {
  // Define the categories and ratings
  const categories = jokeCategories;
  const ratings = [1, 2, 3, 4, 5];

  // Create an empty data array
  const data = {
    categories: [],
    series: [],
    title: "Median rating of jokes by category for all users" 
  };

  const db = client.db("proj");
  const promises = categories.map((category) => {
    const collection = db.collection(category);
    const projection = { _id: 0, joke: 1, rating: 1 };
    return collection
      .find({}, projection)
      .toArray()
      .then((items) => ({ category, jokes: items }));
  });
  Promise.all(promises)
    .then((results) => {
      data.categories = jokeCategories;
      data.series = [];

      categories.forEach((category, i) => {
        data.series.push({
          name: category,
          data: [[i, 0]],
        });
      });


      results.forEach((category, i) => {
        let allratings = [];
        let count = 0;
        category.jokes.forEach((joke) => {
          for (const key of Object.keys(joke.rating)) {
            const rating = joke.rating[key];
            if (rating > 0) {
              allratings.push(rating)
              count++;
            }
          }
        });
        data.series[i].data[0][1] += median(allratings);
        console.log(data.series[i]);
      });
      console.log(data);

      res.render("median", { data });
    })
    .catch((err) => {
      console.log("Error: " + err);
      res.status(500).send("An error occurred while retrieving the data.");
    });

  // Render the EJS file with the Highcharts chart
});

app.get("/user/:name/avg", async (req, res) => {
  // Define the categories and ratings
  const categories = jokeCategories;
  const username = req.params.name;
  const ratings = [1, 2, 3, 4, 5];

  // Create an empty data array
  const data = {
    categories: [],
    series: [],
    title: "Average rating of jokes by category for user: " + username
  };

  const db = client.db("proj");
  const promises = categories.map((category) => {
    const collection = db.collection(category);
    const projection = { _id: 0, joke: 1, rating: 1 };
    const ratingFind = "rating." + username;
    const filter = { [ratingFind]: { $exists: true } }; // use computed property name
    return collection
      .find( filter , projection)
      .toArray()
      .then((items) => ({ category, jokes: items }));
  });
  Promise.all(promises)
    .then((results) => {
      data.categories = jokeCategories;
      data.series = [];

      categories.forEach((category, i) => {
        data.series.push({
          name: category,
          data: [[i, 0]],
        });
      });

      results.forEach((category, i) => {
        let totalrating = 0;
        let count = 0;
        category.jokes.forEach((joke) => {
            const rating = joke.rating[username];
            if (rating > 0) {
              totalrating+= rating;
              count++;
            }
        });

        console.log(count, totalrating)
        data.series[i].data[0][1] += totalrating/count;
      });

      res.render("column", { data });
    })
    .catch((err) => {
      console.log("Error: " + err);
      res.status(500).send("An error occurred while retrieving the data.");
    });

  // Render the EJS file with the Highcharts chart
});


app.get("/user/:name/median", async (req, res) => {
  // Define the categories and ratings
  const categories = jokeCategories;
  const ratings = [1, 2, 3, 4, 5];
  const username = req.params.name;

  // Create an empty data array
  const data = {
    categories: [],
    series: [],
    title: "Median rating of jokes by category for user: " + username
  };

  const db = client.db("proj");
  const promises = categories.map((category) => {
    const collection = db.collection(category);
    const projection = { _id: 0, joke: 1, rating: 1 };
    const ratingFind = "rating." + username;
    const filter = { [ratingFind]: { $exists: true } }; // use computed property name
    return collection
      .find(filter, projection)
      .toArray()
      .then((items) => ({ category, jokes: items }));
  });
  Promise.all(promises)
    .then((results) => {
      data.categories = jokeCategories;
      data.series = [];

      categories.forEach((category, i) => {
        data.series.push({
          name: category,
          data: [[i, 0]],
        });
      });


      results.forEach((category, i) => {
        let allratings = [];
        let count = 0;
        category.jokes.forEach((joke) => {
            const rating = joke.rating[username];
            if (rating > 0) {
              allratings.push(rating)
              count++;
            }
        });
        data.series[i].data[0][1] += median(allratings);
        console.log(data.series[i]);
      });
      console.log(data);

      res.render("median", { data });
    })
    .catch((err) => {
      console.log("Error: " + err);
      res.status(500).send("An error occurred while retrieving the data.");
    });

  // Render the EJS file with the Highcharts chart
});


app.get("/user/:name/bar", async (req, res) => {
  // Define the categories and ratings
  const categories = jokeCategories;
  const ratings = [1, 2, 3, 4, 5];
  const username = req.params.name;

  // Create an empty data array
  const data = {
    categories: [],
    series: [],
    title: "Rating of different categories of jokes for user: " + username
  };

  const db = client.db("proj");
  const promises = categories.map((category) => {
    const collection = db.collection(category);
    const projection = { _id: 0, joke: 1, rating: 1 };
    const ratingFind = "rating." + username;
    const filter = { [ratingFind]: { $exists: true } }; // use computed property name
    return collection
      .find(filter, projection)
      .toArray()
      .then((items) => ({ category, jokes: items }));
  });
  Promise.all(promises)
    .then((results) => {
      data.categories = categories;
      data.series = [];

      ratings.forEach((rating) => {
        data.series.push({
          name: rating + " Star",
          data: [0, 0, 0, 0, 0, 0],
        });
      });

      results.forEach((category, i) => {
        category.jokes.forEach((joke) => {
            const rating = joke.rating[username];
            if (rating > 0) {
              data.series[rating - 1].data[i] =
                data.series[rating - 1].data[i] + 1;
          }
        });
        console.log(data.series[i]);
      });
      console.log(data);

      res.render("bar", { data });
    })
    .catch((err) => {
      console.log("Error: " + err);
      res.status(500).send("An error occurred while retrieving the data.");
    });

  // Render the EJS file with the Highcharts chart
});



function median(numbers) {
    const sorted = Array.from(numbers).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
}
