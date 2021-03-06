'use strict';

(function() {
  let refreshChannels = async function(ircUser) {
    const irslackd = this;
    console.log('slack_out: refreshChannels');
    let convos = await ircUser.slackWeb.paginateCallOrThrow('conversations.list', 'channels', {
      types: 'public_channel,private_channel,mpim',
      limit: 1000,
    });
    let joinPromises = new Map();
    convos.channels.forEach((convo) => {
      if (convo.is_archived) return;
      if (convo.is_mpim) return;
      hydrateChannel(irslackd, ircUser, joinPromises, convo);
    });
    while (joinPromises.size > 0) {
      if (await joinChannel(irslackd, ircUser, joinPromises) === false) {
        break;
      }
    }
  };

  let refreshUsers = async function(ircUser) {
    const irslackd = this;
    console.log('slack_out: refreshUsers');
    let users = await ircUser.slackWeb.paginateCallOrThrow('users.list', 'members', { limit: 1000 });
    users.members.forEach((user) => {
      if (user.deleted) return;
      let ircNick = irslackd.replaceIllegalIrcNickChars(user.name);
      ircUser.mapIrcToSlack(ircNick, user.id);
    });
  };

  let refreshTeams = async function(ircUser) {
    let teams = await ircUser.slackWeb.apiCallOrThrow('usergroups.list', {
      include_count: false,
      include_disabled: false,
      include_users: false,
      limit: 1000,
    });
    teams.usergroups.forEach((team) => {
      ircUser.mapIrcToSlack(team.handle, team.id);
    });
  };

  let hydrateChannel = async function(irslackd, ircUser, joinPromises, convo) {
    convo.ircChan = '#' + irslackd.replaceIllegalIrcChanChars(convo.name);
    ircUser.mapIrcToSlack(convo.ircChan, convo.id);
    if (!convo.is_member) return;
    console.log('slack_out: hydrateChannel ' + convo.name);
    convo.members = (async function() {
      let members = await ircUser.slackWeb.paginateCallOrThrow('conversations.members', 'members', {
        channel: convo.id,
        limit: 1000,
      });
      members.convo = convo;
      return members;
    })();
    joinPromises.set(convo.ircChan, convo.members);
  };

  let joinChannel = async function(irslackd, ircUser, joinPromises) {
    let members;
    try {
      members = await Promise.race(joinPromises.values());
    } catch (e) {
      irslackd.logError(ircUser, e);
      return false;
    }
    let ircChan = members.convo.ircChan;
    console.log('irc_out: joinChannel ' + ircChan);
    joinPromises.delete(ircChan);
    let ircNicks = [ ircUser.ircNick ];
    members.members.forEach((userId) => {
      let ircNick = ircUser.slackToIrc.get(userId);
      if (ircNick) {
        ircNicks.push(ircNick);
      } else {
        // Probably deactivated
        // irslackd.logError(ircUser, 'No user for userId ' + userId);
      }
    });
    irslackd.sendIrcChannelJoin(ircUser, ircChan, members.convo.topic.value, ircNicks);
  };

  exports.refreshChannels = refreshChannels;
  exports.refreshUsers = refreshUsers;
  exports.refreshTeams = refreshTeams;
})();
