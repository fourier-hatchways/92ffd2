import React, { useCallback, useEffect, useState, useContext } from "react";
import axios from "axios";
import { useHistory } from "react-router-dom";
import { Grid, CssBaseline, Button } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";

import { SidebarContainer } from "../components/Sidebar";
import { ActiveChat } from "../components/ActiveChat";
import { SocketContext } from "../context/socket";

const useStyles = makeStyles((theme) => ({
  root: {
    height: "100vh",
  },
}));

const Home = ({ user, logout }) => {
  const history = useHistory();

  const socket = useContext(SocketContext);

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);

  const classes = useStyles();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const addSearchedUsers = (users) => {
    const currentUsers = {};

    // make table of current users so we can lookup faster
    conversations.forEach((convo) => {  
      currentUsers[convo.otherUser.id] = true;
    });

    const newState = [...conversations];
    users.forEach((user) => {
      // only create a fake convo if we don't already have a convo with this user
      if (!currentUsers[user.id]) {
        let fakeConvo = { otherUser: user, messages: [] };
        newState.push(fakeConvo);
      }
    });

    setConversations(newState);
  };

  const clearSearchedUsers = () => {
    setConversations((prev) => prev.filter((convo) => convo.id));
  };

  const saveMessage = async (body) => {
    const { data } = await axios.post("/api/messages", body);
    return data;
  };
  
  const saveReadStatus = async (body) => {
    const { data } = await axios.put("/api/readMessages", body);
    return data;
  }

  const sendMessage = (data, body) => {
    socket.emit("new-message", {
      message: data.message,
      recipientId: body.recipientId,
      sender: data.sender,
    });
  };

  const sendReadStatus = (data) => {
    socket.emit("read-message", {
      ...data,
    });
  };

  const putReadStatus = async (body) => {
    try {
      const data = await saveReadStatus(body); //expect { conversationId, readerId, otherUserId, readerLastRead, otherUserLastRead }

      if (data.conversationId) {
        updateReadStatus(data);
        sendReadStatus(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const postMessage = async (body) => {
    try {
      const data = await saveMessage(body);

      if (!body.conversationId) {
        addNewConvo(body.recipientId, data.message);
      } else {
        addMessageToConversation(data);
      }

      sendMessage(data, body);
    } catch (error) {
      console.error(error);
    }
  };

  const updateReadStatus = useCallback(
    (data) => {
      const { conversationId, readerId, otherUserId, readerLastRead, otherUserLastRead } = data;
      setConversations((prev) => 
        prev.map((convo) => {
          if (convo.id === conversationId) {
            const convoCopy = { ...convo, messages: [ ...convo.messages ]};
            if (convo.otherUser.id !== readerId) {
              convoCopy.unreadCount = 0;
              convoCopy.lastRead = otherUserLastRead;
            } else {
              convoCopy.lastRead = readerLastRead;
            }
            return convoCopy;
          } else {
            return convo;
          }
      })
    );
  }, []);

  const addNewConvo = useCallback(
    (recipientId, message) => {
      setConversations((prev) => 
        prev.map((convo) => {
          if (convo.otherUser.id === recipientId) {
            const convoCopy = { ...convo, messages: [ ...convo.messages ], unreadCount: 0, lastRead: -1};
            convoCopy.messages.push(message);
            convoCopy.latestMessageText = message.text;
            convoCopy.id = message.conversationId;
            return convoCopy;
          } else {
            return convo;
          }
        })
      );
  }, []);

  const addMessageToConversation = useCallback(
    (data) => {
      // if sender isn't null, that means the message needs to be put in a brand new convo
      const { message, sender = null } = data;
      if (sender !== null) {
        const newConvo = {
          id: message.conversationId,
          otherUser: sender,
          messages: [message],
          unreadCount: 1,
          lastRead: -1,
        };
        newConvo.latestMessageText = message.text;
        setConversations((prev) => {
          const fakeConvo = prev.filter((convo) => convo.otherUser.id === newConvo.otherUser.id)[0];
          if (fakeConvo) {
            if (newConvo.otherUser.id === activeConversation) {
              newConvo.unreadCount = 0;
              putReadStatus({ recipientId: newConvo.otherUser.id });
            }
            return prev.map((convo) => {
              if (convo.otherUser.id === newConvo.otherUser.id) {
                return newConvo;
              } else {
                return convo;
              }
            })
          } else {
            return [newConvo, ...prev];
          }
        });
      } else {
        setConversations((prev) => 
          prev.map((convo) => {
            if (convo.id === message.conversationId) {
              const convoCopy = { ...convo, messages: [ ...convo.messages ] };
              convoCopy.messages.push(message);
              convoCopy.latestMessageText = message.text;
              if (message.senderId !== activeConversation) {
                if (message.senderId === convoCopy.otherUser.id) {
                  convoCopy.unreadCount++;
                }
              } else {
                putReadStatus({ recipientId: message.senderId });
              }
              return convoCopy;
            } else {
              return convo;
            }
          }),
        );
      };
    }, [activeConversation]);

  const setActiveChat = (id) => {
    try {
      setActiveConversation(id);
      putReadStatus({ recipientId: id});
    } catch (error) {
      console.error(error);
    }
  };

  const addOnlineUser = useCallback((id) => {
    setConversations((prev) =>
      prev.map((convo) => {
        if (convo.otherUser.id === id) {
          const convoCopy = { ...convo };
          convoCopy.otherUser = { ...convoCopy.otherUser, online: true };
          return convoCopy;
        } else {
          return convo;
        }
      }),
    );
  }, []);

  const removeOfflineUser = useCallback((id) => {
    setConversations((prev) =>
      prev.map((convo) => {
        if (convo.otherUser.id === id) {
          const convoCopy = { ...convo };
          convoCopy.otherUser = { ...convoCopy.otherUser, online: false };
          return convoCopy;
        } else {
          return convo;
        }
      }),
    );
  }, []);

  // Lifecycle

  useEffect(() => {
    // Socket init
    socket.on("read-message", updateReadStatus);
    socket.on("add-online-user", addOnlineUser);
    socket.on("remove-offline-user", removeOfflineUser);
    socket.on("new-message", addMessageToConversation);

    return () => {
      // before the component is destroyed
      // unbind all event handlers used in this component
      socket.off("read-message", updateReadStatus);
      socket.off("add-online-user", addOnlineUser);
      socket.off("remove-offline-user", removeOfflineUser);
      socket.off("new-message", addMessageToConversation);
    };
  }, [updateReadStatus, addMessageToConversation, addOnlineUser, removeOfflineUser, socket]);

  useEffect(() => {
    // when fetching, prevent redirect
    if (user?.isFetching) return;

    if (user && user.id) {
      setIsLoggedIn(true);
    } else {
      // If we were previously logged in, redirect to login instead of register
      if (isLoggedIn) history.push("/login");
      else history.push("/register");
    }
  }, [user, history, isLoggedIn]);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const { data } = await axios.get("/api/conversations");
        setConversations(data);
      } catch (error) {
        console.error(error);
      }
    };
    if (!user.isFetching) {
      fetchConversations();
    }
  }, [user]);

  const handleLogout = async () => {
    if (user && user.id) {
      await logout(user.id);
    }
  };

  return (
    <>
      <Button onClick={handleLogout}>Logout</Button>
      <Grid container component="main" className={classes.root}>
        <CssBaseline />
        <SidebarContainer
          conversations={conversations}
          user={user}
          clearSearchedUsers={clearSearchedUsers}
          addSearchedUsers={addSearchedUsers}
          setActiveChat={setActiveChat}
        />
        <ActiveChat
          activeConversation={activeConversation}
          conversations={conversations}
          user={user}
          postMessage={postMessage}
        />
      </Grid>
    </>
  );
};

export default Home;
