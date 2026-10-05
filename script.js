async function api(url, options={}) {
  const res = await fetch(url, {
    headers: {"Content-Type":"application/json"},
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadStats(){
  const s = await api("/api/stats");
  document.getElementById("stats").innerHTML = `
    <div class="stat"><b>Total Books</b><h2>${s.totalBooks}</h2></div>
    <div class="stat"><b>Available</b><h2>${s.availableBooks}</h2></div>
    <div class="stat"><b>Issued</b><h2>${s.issuedBooks}</h2></div>
    <div class="stat"><b>Members</b><h2>${s.members}</h2></div>`;
}

async function loadBooks(){
  const q = encodeURIComponent(document.getElementById("search").value);
  const books = await api("/api/books?search="+q);

  document.getElementById("bookList").innerHTML = books.map(b => `
    <div class="book">
      <div class="actions">
        <button onclick='editBook(${JSON.stringify(b)})'>Edit</button>
        <button onclick="deleteBook(${b.id})">Delete</button>
      </div>
      <b>${escapeHtml(b.title)}</b>
      <p>${escapeHtml(b.author)} | ${escapeHtml(b.category)} | ISBN: ${escapeHtml(b.isbn)}</p>
      <span class="badge">Available: ${b.available} / ${b.quantity}</span>
    </div>
  `).join("");

  document.getElementById("issueBook").innerHTML =
    books.filter(b=>b.available>0)
      .map(b=>`<option value="${b.id}">${escapeHtml(b.title)} (${b.available} available)</option>`).join("");
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function openBookForm(){
  document.getElementById("bookForm").classList.remove("hidden");
  document.getElementById("bookFormTitle").textContent="Add Book";
  document.getElementById("bookId").value="";
  ["title","author","isbn","category","quantity"].forEach(id=>document.getElementById(id).value="");
}

function closeBookForm(){
  document.getElementById("bookForm").classList.add("hidden");
}

function editBook(b){
  openBookForm();
  document.getElementById("bookFormTitle").textContent="Edit Book";
  bookId.value=b.id; title.value=b.title; author.value=b.author;
  isbn.value=b.isbn; category.value=b.category; quantity.value=b.quantity;
  location.hash="bookForm";
}

async function saveBook(){
  try{
    const body={
      title:title.value.trim(), author:author.value.trim(),
      isbn:isbn.value.trim(), category:category.value.trim(),
      quantity:Number(quantity.value)
    };
    const id=bookId.value;
    await api(id?"/api/books/"+id:"/api/books",{
      method:id?"PUT":"POST", body:JSON.stringify(body)
    });
    closeBookForm(); await refresh();
  }catch(e){bookMsg.textContent=e.message;}
}

async function deleteBook(id){
  if(!confirm("Delete this book?")) return;
  try{await api("/api/books/"+id,{method:"DELETE"}); await refresh();}
  catch(e){alert(e.message);}
}

document.getElementById("memberForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    await api("/api/members",{
      method:"POST",
      body:JSON.stringify({
        name:memberName.value.trim(),
        email:memberEmail.value.trim(),
        phone:memberPhone.value.trim()
      })
    });
    memberMsg.textContent="Member registered successfully.";
    e.target.reset(); await refresh();
  }catch(err){memberMsg.textContent=err.message;}
});

async function loadMembers(){
  const members=await api("/api/members");
  issueMember.innerHTML=members.length
    ? members.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")
    : "<option value=''>No members</option>";
}

async function issueBook(){
  try{
    await api("/api/issues",{
      method:"POST",
      body:JSON.stringify({
        member_id:Number(issueMember.value),
        book_id:Number(issueBook.value)
      })
    });
    alert("Book issued successfully.");
    await refresh();
  }catch(e){alert(e.message);}
}

async function loadIssues(){
  const issues=await api("/api/issues");
  issueList.innerHTML=issues.map(i=>`
    <div class="issue">
      <b>${escapeHtml(i.book_title)}</b> → ${escapeHtml(i.member_name)}
      <p>Issued: ${i.issue_date}
      ${i.returned ? " | Returned: "+i.return_date : ""}</p>
      ${i.returned ? "<span class='badge'>Returned</span>"
      : `<button onclick="returnBook(${i.id})">Return Book</button>`}
    </div>
  `).join("");
}

async function returnBook(id){
  try{
    await api("/api/issues/"+id+"/return",{method:"PUT"});
    await refresh();
  }catch(e){alert(e.message);}
}

async function refresh(){
  await Promise.all([loadStats(),loadBooks(),loadMembers(),loadIssues()]);
}

refresh();